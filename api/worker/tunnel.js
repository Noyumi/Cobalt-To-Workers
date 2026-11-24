import { create as contentDisposition } from "content-disposition-header";
import { openHlsAudio } from "./hls-audio.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const base64Options = { alphabet: "base64url", omitPadding: true };
const tunnelContext = encoder.encode("worker-media-saver/tunnel/v1");
const tunnelLifetime = 5 * 60 * 1000;
const nonceLength = 12;
const maxTokenLength = 8192;
const maxRedirects = 5;
const redirects = new Set([301, 302, 303, 307, 308]);

const mediaHosts = new Map([
    ["streamable", ["*.streamable.com"]],
    ["newgrounds", ["*.newgrounds.com", "*.ngfiles.com", "*.ungrounded.net"]],
    ["bsky", ["cdn.bsky.app", "media.tenor.com"]],
    ["pinterest", ["i.pinimg.com", "v1.pinimg.com"]],
    ["soundcloud", ["*.sndcdn.com", "playback.media-streaming.soundcloud.cloud"]],
    ["youtube", ["*.googlevideo.com", "i.ytimg.com"]],
    ["tiktok", ["*.tiktokcdn.com", "*.tiktokcdn-us.com", "*.tiktokcdn-eu.com", "*.tiktokv.com", "*.muscdn.com"]],
]);

export function isMediaURLAllowed(service, target) {
    const url = URL.parse(target);
    if (!url || url.protocol !== "https:" || url.port || url.username || url.password) return false;

    const hosts = mediaHosts.get(service === "bluesky" ? "bsky" : service);
    return hosts?.some((host) => host.startsWith("*.")
        ? url.hostname.endsWith(host.slice(1))
        : url.hostname === host) ?? false;
}

export async function fetchFollowingRedirects(target, options, isAllowed) {
    let url = new URL(target);

    // Check each hop before forwarding any headers or fetching that destination.
    for (let hop = 0; hop <= maxRedirects; hop++) {
        if (!isAllowed(url)) throw new Error("Upstream URL is outside the adapter allowlist");

        const response = await fetch(url, { ...options, redirect: "manual" });
        if (!redirects.has(response.status)) return response;

        const location = response.headers.get("Location");
        await response.body?.cancel();
        if (!location) throw new Error("Upstream redirect is missing a destination");
        url = new URL(location, url);
    }

    throw new Error("Upstream redirect limit exceeded");
}

function encryptionKey(secret) {
    if (typeof secret !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(secret)) {
        throw new Error("TUNNEL_SECRET must be a base64url-encoded 32-byte key");
    }

    const bytes = Uint8Array.fromBase64(secret, { alphabet: "base64url" });
    if (bytes.toBase64(base64Options) !== secret) {
        throw new Error("TUNNEL_SECRET is not canonical base64url");
    }

    return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function createTunnel({ service, url, filename = "download", hlsAudio }, env, apiURL) {
    if (!isMediaURLAllowed(service, url) || !filename || /[\r\n]/.test(filename)) {
        throw new Error("Invalid media or filename for tunnel");
    }

    const data = encoder.encode(JSON.stringify({
        service,
        url: String(url),
        filename,
        hlsAudio,
        expires: Date.now() + tunnelLifetime,
    }));
    const iv = crypto.getRandomValues(new Uint8Array(nonceLength));
    const key = await encryptionKey(env.TUNNEL_SECRET);
    const encrypted = new Uint8Array(await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: tunnelContext }, key, data,
    ));

    const token = new Uint8Array(nonceLength + encrypted.length);
    token.set(iv);
    token.set(encrypted, nonceLength);
    const encoded = token.toBase64(base64Options);
    if (encoded.length > maxTokenLength) throw new Error("Tunnel URL is too long");

    const tunnel = new URL("/tunnel", apiURL);
    tunnel.searchParams.set("token", encoded);
    return tunnel.href;
}

async function openTunnel(encoded, secret) {
    const key = await encryptionKey(secret);

    try {
        const token = Uint8Array.fromBase64(encoded, { alphabet: "base64url" });
        if (token.toBase64(base64Options) !== encoded) return;

        const data = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: token.subarray(0, nonceLength), additionalData: tunnelContext },
            key,
            token.subarray(nonceLength),
        );
        const media = JSON.parse(decoder.decode(data));
        if (media.expires > Date.now() && isMediaURLAllowed(media.service, media.url)) return media;
    } catch {
        return;
    }
}

export async function handleTunnel(request, env) {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    if (!token || token.length > maxTokenLength || !/^[A-Za-z0-9_-]+$/.test(token)) {
        return new Response(null, { status: 400 });
    }

    const media = await openTunnel(token, env.TUNNEL_SECRET);
    if (!media) return new Response(null, { status: 403 });
    if (searchParams.has("p")) return new Response(null, { status: 200 });

    try {
        const upstreamHeaders = new Headers({ "Accept-Encoding": "identity" });
        if (media.service === "tiktok") upstreamHeaders.set("Referer", "https://www.tiktok.com/");
        const range = request.headers.get("Range");
        const target = new URL(media.url);
        const size = Number(target.searchParams.get("clen"));
        const fetchWholeRange = !range && media.service === "youtube" && target.hostname.endsWith(".googlevideo.com")
            && Number.isSafeInteger(size) && size > 0;
        if (range) upstreamHeaders.set("Range", range);
        if (fetchWholeRange) upstreamHeaders.set("Range", `bytes=0-${size - 1}`);

        const isAllowed = (url) => isMediaURLAllowed(media.service, url);
        const upstream = media.hlsAudio
            ? await openHlsAudio(media.url, (url, signal) => fetch(url, {
                redirect: "manual",
                signal: signal ? AbortSignal.any([signal, request.signal]) : request.signal,
            }), isAllowed)
            : await fetchFollowingRedirects(
                media.url,
                { headers: upstreamHeaders, signal: request.signal, cache: "no-store" },
                isAllowed,
            );

        const headers = new Headers({
            "Cache-Control": "private, no-store",
            "Cross-Origin-Resource-Policy": "cross-origin",
            "Referrer-Policy": "no-referrer",
            "X-Content-Type-Options": "nosniff",
        });
        if (upstream.status === 416) {
            const contentRange = upstream.headers.get("Content-Range");
            if (contentRange) headers.set("Content-Range", contentRange);
            await upstream.body?.cancel();
            return new Response(null, { status: 416, headers });
        }
        if (!upstream.ok) {
            await upstream.body?.cancel();
            return new Response(null, { status: upstream.status === 404 ? 404 : 502, headers });
        }

        if (fetchWholeRange && upstream.status === 206 && upstream.headers.get("Content-Range") !== `bytes 0-${size - 1}/${size}`) {
            await upstream.body?.cancel();
            return new Response(null, { status: 502, headers });
        }

        headers.set("Content-Disposition", contentDisposition(media.filename));
        for (const name of ["Accept-Ranges", "Content-Encoding", "Content-Range", "Content-Type"]) {
            if (fetchWholeRange && name === "Content-Range") continue;
            const value = upstream.headers.get(name);
            if (value) headers.set(name, value);
        }

        const length = upstream.headers.get("Content-Length");
        if (length && !headers.has("Content-Encoding")) headers.set("Estimated-Content-Length", length);

        return new Response(upstream.body, { status: fetchWholeRange ? 200 : upstream.status, headers });
    } catch {
        return new Response(null, { status: 502 });
    }
}
