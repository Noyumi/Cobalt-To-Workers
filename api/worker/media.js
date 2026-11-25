import matchAction from "../src/processing/match-action.js";
import { extract, normalizeURL } from "../src/processing/link.js";
import { formatResponse } from "../src/processing/response.js";
import bluesky from "../src/processing/services/bluesky.js";
import loom from "../src/processing/services/loom.js";
import newgrounds from "../src/processing/services/newgrounds.js";
import streamable from "../src/processing/services/streamable.js";
import soundcloud from "../src/processing/services/soundcloud.js";
import tiktok from "../src/processing/services/tiktok.js";
import tumblr from "../src/processing/services/tumblr.js";
import instagram from "./instagram.js";
import pinterest from "./pinterest.js";
import reddit from "./reddit.js";
import snapchat from "./snapchat.js";
import spotify from "./spotify.js";
import twitch from "./twitch.js";
import twitter from "./twitter.js";
import { createTunnel, fetchFollowingRedirects, isMediaURLAllowed } from "./tunnel.js";

const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";
const durationLimit = 10800;
const soundCloudHosts = ["soundcloud.com", "www.soundcloud.com", "on.soundcloud.com", "api-v2.soundcloud.com", "a-v2.sndcdn.com"];
const youtubeHosts = ["www.youtube.com", "youtubei.googleapis.com"];

const adapters = {
    streamable: { resolve: streamable, metadataHosts: ["api.streamable.com"] },
    newgrounds: { resolve: newgrounds, metadataHosts: ["www.newgrounds.com", "newgrounds.com"] },
    bsky: { resolve: bluesky, metadataHosts: ["public.api.bsky.app"] },
    instagram: {
        resolve: instagram,
        metadataHosts: ["www.instagram.com", "instagram.com"],
        alwaysProxy: true,
        tunnelPicker: true,
    },
    loom: { resolve: loom, metadataHosts: ["www.loom.com"], alwaysProxy: true },
    pinterest: {
        resolve: pinterest,
        metadataHosts: ["pin.it", "pinterest.com", "www.pinterest.com"],
        alwaysProxy: true,
    },
    reddit: {
        resolve: reddit,
        metadataHosts: ["www.redditmedia.com", "www.reddit.com", "reddit.com", "v.redd.it"],
        alwaysProxy: true,
    },
    snapchat: {
        resolve: snapchat,
        metadataHosts: ["www.snapchat.com", "snapchat.com", "t.snapchat.com"],
        alwaysProxy: true,
    },
    soundcloud: {
        resolve: soundcloud,
        metadataHosts: soundCloudHosts,
    },
    spotify: {
        resolve: spotify,
        metadataHosts: ["open.spotify.com", ...soundCloudHosts, ...youtubeHosts, "music.youtube.com"],
    },
    youtube: {
        resolve: async options => (await import("./youtube.js")).default(options),
        metadataHosts: youtubeHosts,
    },
    tiktok: { resolve: tiktok, metadataHosts: ["www.tiktok.com", "tiktok.com", "vt.tiktok.com"] },
    tumblr: { resolve: tumblr, metadataHosts: ["api-http2.tumblr.com"], alwaysProxy: true },
    twitch: { resolve: twitch, metadataHosts: ["gql.twitch.tv"], alwaysProxy: true },
    twitter: {
        resolve: twitter,
        metadataHosts: ["cdn.syndication.twimg.com"],
        alwaysProxy: true,
        tunnelPicker: true,
    },
};

export function enabledServices(disabled = "") {
    const excluded = new Set(disabled.split(",").map(service => service.trim()));
    if (excluded.has("soundcloud") && excluded.has("youtube")) excluded.add("spotify");
    return new Set(Object.keys(adapters).filter(service => !excluded.has(service)));
}

export function extractMediaLink(url, services) {
    if (url.hostname !== "open.spotify.com") return extract(url, services);
    if (!services.has("spotify")) return { error: "service.disabled" };

    const id = /^\/(?:intl-[a-z-]+\/)?track\/([A-Za-z0-9]{22})$/.exec(url.pathname)?.[1];
    return id
        ? { host: "spotify", patternMatch: { id } }
        : { error: "link.unsupported", context: { service: "spotify" } };
}

function mediaURL(service, value) {
    const url = new URL(String(value).replace(/^\/\//, "https://"));
    if (!isMediaURLAllowed(service, url)) {
        throw new Error("Media destination is not allowed");
    }
    return url.href;
}

function providerFetcher(hosts, signal) {
    const isAllowed = url => url.protocol === "https:" && !url.port && !url.username && !url.password
        && hosts.includes(url.hostname);

    return (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input);
        if (!isAllowed(url)) throw new Error("Metadata destination is not allowed");

        const method = init?.method ?? (input instanceof Request ? input.method : "GET");
        if (method !== "GET" || init?.redirect === "manual") {
            return fetch(input, { ...init, signal, redirect: "manual" });
        }
        return fetchFollowingRedirects(url, { ...init, signal }, isAllowed);
    };
}

async function probeMediaURL(url, contentLength, service, signal) {
    const target = URL.parse(url);
    const isAllowed = candidate => isMediaURLAllowed(service, candidate);
    if (!target || !isAllowed(target)) return false;

    // Probe the last byte when the length is known so truncated files fail the check.
    const length = contentLength ?? Number(target.searchParams.get("clen"));
    const hasLength = Number.isSafeInteger(length) && length > 0;
    const lastByte = hasLength ? length - 1 : 0;
    try {
        const response = await fetchFollowingRedirects(target, {
            headers: { Range: `bytes=${lastByte}-${lastByte}`, "Accept-Encoding": "identity" },
            cache: "no-store",
            signal,
        }, isAllowed);
        await response.body?.cancel();
        if (response.status === 206) {
            const received = response.headers.get("Content-Range");
            return hasLength
                ? received === `bytes ${lastByte}-${lastByte}/${length}`
                : received?.startsWith("bytes 0-0/") === true;
        }
        return response.status === 200
            && (!hasLength || Number(response.headers.get("Content-Length")) === length);
    } catch {
        return false;
    }
}

function mediaStream(env, defaultService, audioManifest) {
    return ({ filename, url, service = defaultService }) => {
        const target = mediaURL(service, url);
        return createTunnel({
            filename,
            url: target,
            service,
            hlsAudio: target === audioManifest || undefined,
        }, env, env.API_URL);
    };
}

function mediaResponder(createStream, mediaService, tunnelPicker) {
    return async (type, data) => {
        if (type === "redirect") {
            return formatResponse(type, { ...data, url: mediaURL(mediaService, data.url) });
        }
        if (type === "tunnel") {
            return formatResponse(type, data, { url: await createStream(data) });
        }
        if (type === "picker" && tunnelPicker) {
            const picker = await Promise.all(data.picker.map(async item => {
                const url = await createStream(item);
                let thumb = item.thumb;
                if (thumb === item.url) thumb = url;
                else if (thumb) thumb = await createStream({ url: thumb });
                return { type: item.type, url, thumb };
            }));
            return formatResponse(type, { ...data, picker });
        }
        if (type === "local-processing") {
            const inputs = [data.url].flat();
            if (data.subtitles) inputs.push(data.subtitles);
            if (data.cover) inputs.push(data.cover);
            const tunnels = await Promise.all(inputs.map(url => createStream({ url })));
            return formatResponse(type, data, { tunnels });
        }
        return formatResponse(type, data);
    };
}

export async function resolveMedia({ host, patternMatch }, params, env, verified) {
    const adapter = adapters[host];
    const signal = AbortSignal.timeout(12_000);
    const fetcher = providerFetcher(adapter.metadataHosts, signal);

    async function resolveRedirectingURL(url) {
        const response = await fetcher(url, { headers: { "User-Agent": userAgent } });
        await response.body?.cancel();
        if (!response.url) return;
        const parsed = extract(normalizeURL(response.url), new Set([host]));
        if (parsed.host === host) return parsed.patternMatch;
    }

    const alwaysProxy = adapter.alwaysProxy || params.alwaysProxy || params.localProcessing === "forced";
    const result = await adapter.resolve({
        ...patternMatch,
        url: params.url,
        isAudioOnly: params.downloadMode === "audio",
        isAudioMuted: params.downloadMode === "mute",
        quality: params.videoQuality,
        params,
        userAgent,
        fetcher,
        probeMedia: (url, length, service = host) => probeMediaURL(url, length, service, signal),
        alwaysProxy: alwaysProxy || host === "tiktok",
        createStream: mediaStream(env, host),
        allowVideo: false,
        durationLimit,
        format: params.audioFormat,
        fragmentedAAC: host === "soundcloud",
        audioServices: host === "spotify" ? enabledServices(env.DISABLED_SERVICES) : undefined,
        includeCover: false,
        resolveRedirectingURL,
        fullAudio: params.tiktokFullAudio,
        h265: params.allowH265,
        subtitleLang: params.subtitleLang === "none" ? undefined : params.subtitleLang,
    });

    if (result.error) {
        const context = result.error === "content.too_long" ? { limit: durationLimit / 60 } : undefined;
        return formatResponse("error", { code: `error.api.${result.error}`, context });
    }

    const mediaService = result.mediaService ?? host;
    const isAudioOnly = mediaService === "soundcloud" || result.isAudioOnly || params.downloadMode === "audio";
    const hasVideo = result.picker
        ? result.picker.some(item => item.type === "video")
        : !result.isPhoto && !isAudioOnly && !(result.isGif && params.convertGif);
    if (hasVideo && !verified) {
        return formatResponse("error", { code: "error.api.auth.jwt.missing" });
    }

    if (host === "tiktok" && result.picker) {
        return formatResponse("picker", { picker: result.picker, audioAvailable: Boolean(result.urls) });
    }

    const audioManifest = mediaService === "soundcloud" && result.isHLS
        ? mediaURL(mediaService, result.urls)
        : undefined;
    const createStream = mediaStream(env, mediaService, audioManifest);
    const createResponse = mediaResponder(createStream, mediaService, adapter.tunnelPicker);
    return await matchAction({
        r: audioManifest ? { ...result, isHLS: false } : result,
        host: mediaService,
        audioFormat: params.audioFormat,
        isAudioOnly,
        isAudioMuted: mediaService !== "soundcloud" && !result.isAudioOnly && params.downloadMode === "mute",
        disableMetadata: params.disableMetadata,
        filenameStyle: params.filenameStyle,
        convertGif: params.convertGif,
        audioBitrate: params.audioBitrate,
        alwaysProxy,
        localProcessing: params.localProcessing === "forced" ? "forced" : "preferred",
    }, { createResponse, createStream });
}
