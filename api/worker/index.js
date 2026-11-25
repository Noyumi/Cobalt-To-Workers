import ipaddr from "ipaddr.js";
import apiPackage from "../package.json";
import { normalizeRequest } from "../src/processing/schema.js";
import { friendlyServiceName } from "../src/processing/service-alias.js";
import { createSession, verifySession } from "./auth.js";
import { enabledServices, extractMediaLink, resolveMedia } from "./media.js";
import { handleTunnel } from "./tunnel.js";

const jsonType = /^application\/json(?:;\s*charset=utf-8)?$/i;
const maxRequestBytes = 1024;
const startedAt = String(Date.now());
const requiredBindings = [
    "API_URL", "WEB_ORIGIN", "TURNSTILE_SITEKEY", "TURNSTILE_SECRET", "JWT_SECRET", "TUNNEL_SECRET",
];
const protectedRoutes = new Map([
    ["POST /", { handle: handleDownload, limiter: "API_LIMITER" }],
    ["POST /session", { handle: handleSession, limiter: "SESSION_LIMITER" }],
    ["GET /tunnel", { handle: handleTunnel, limiter: "TUNNEL_LIMITER" }],
]);

function error(code, status = 400, context) {
    return Response.json({
        status: "error",
        error: { code: `error.api.${code}`, context },
    }, { status });
}

async function readJsonBody(request) {
    if (!request.body || Number(request.headers.get("Content-Length")) > maxRequestBytes) {
        return;
    }

    const buffer = new Uint8Array(maxRequestBytes);
    const reader = request.body.getReader();
    let size = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (size + value.byteLength > buffer.length) {
                await reader.cancel();
                return;
            }
            buffer.set(value, size);
            size += value.byteLength;
        }
        const body = JSON.parse(new TextDecoder().decode(buffer.subarray(0, size)));
        if (body && typeof body === "object" && !Array.isArray(body)) return body;
    } catch {
        return;
    } finally {
        reader.releaseLock();
    }
}

function rateKey(ip) {
    const address = ipaddr.process(ip);
    if (address.kind() === "ipv4") return address.toString();

    const bytes = address.toByteArray();
    bytes.fill(0, 7);
    return ipaddr.fromByteArray(bytes).toString();
}

function rateExceeded() {
    const response = error("rate_exceeded", 429, { limit: 60 });
    response.headers.set("Retry-After", "60");
    return response;
}

function serverInfo(env) {
    const source = URL.parse(env.SOURCE_URL);
    const remote = source?.hostname === "github.com"
        ? source.pathname.replace(/^\//, "").replace(/\.git$/, "")
        : undefined;
    return Response.json({
        cobalt: {
            version: apiPackage.version,
            url: env.API_URL,
            startTime: startedAt,
            services: [...enabledServices(env.DISABLED_SERVICES)].map(friendlyServiceName),
            turnstileSitekey: env.TURNSTILE_SITEKEY,
            localProcessingRequired: true,
            source: source?.href,
        },
        git: { remote, branch: env.GIT_BRANCH, commit: env.GIT_COMMIT },
    });
}

async function handleSession(request, env, ip) {
    const challenge = request.headers.get("cf-turnstile-response");
    if (!challenge) return error("auth.turnstile.missing");

    const session = await createSession(challenge, ip, env);
    return session ? Response.json(session) : error("auth.turnstile.invalid");
}

async function handleDownload(request, env, ip) {
    if (!jsonType.test(request.headers.get("Accept"))) return error("header.accept");
    if (!jsonType.test(request.headers.get("Content-Type"))) return error("header.content_type");

    const authorization = request.headers.get("Authorization");
    const verified = authorization ? await verifySession(authorization, ip, env) : false;
    if (authorization && !verified) return error("auth.jwt.invalid");

    const body = await readJsonBody(request);
    if (!body) return error("invalid_body");
    if (!body.url) return error("link.missing");

    const input = await normalizeRequest(body);
    if (!input.success) return error("invalid_body");

    const parsed = extractMediaLink(input.data.url, enabledServices(env.DISABLED_SERVICES));
    if (parsed.error) return error(parsed.error, 400, parsed.context);

    try {
        const result = await resolveMedia(parsed, input.data, env, verified);
        return Response.json(result.body, { status: result.status });
    } catch {
        return error("fetch.critical", 400, { service: friendlyServiceName(parsed.host) });
    }
}

async function handleRequest(request, env) {
    const { pathname } = new URL(request.url);
    const route = request.method + " " + pathname;
    if (route === "GET /") return serverInfo(env);

    const endpoint = protectedRoutes.get(route);
    if (!endpoint) return error("link.unsupported", 404);
    if (requiredBindings.some(name => !env[name])) return error("auth.not_configured", 503);

    const ip = request.headers.get("CF-Connecting-IP");
    if (!ip || !ipaddr.isValid(ip)) return error("generic");

    const limiter = env[endpoint.limiter];
    if (!(await limiter.limit({ key: rateKey(ip) })).success) return rateExceeded();
    return endpoint.handle(request, env, ip);
}

export default {
    async fetch(request, env) {
        const origin = request.headers.get("Origin");
        if (origin && origin !== env.WEB_ORIGIN) {
            return error("generic", 403);
        }

        let response;
        try {
            response = request.method === "OPTIONS"
                ? new Response(null, { status: 204 })
                : await handleRequest(request, env);
        } catch {
            console.error("Worker request failed");
            response = error("generic", 500);
        }

        response.headers.set("Vary", "Origin");
        response.headers.set("Cache-Control", "no-store");
        if (origin) {
            response.headers.set("Access-Control-Allow-Origin", origin);
            response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            response.headers.set("Access-Control-Allow-Headers", "Accept, Authorization, Content-Type, Range, CF-Turnstile-Response");
            response.headers.set("Access-Control-Expose-Headers", "Content-Disposition, Content-Range, Estimated-Content-Length, Retry-After");
        }
        return response;
    },
};
