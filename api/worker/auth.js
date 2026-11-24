const encoder = new TextEncoder();
const decoder = new TextDecoder();
const sessionLifetime = 120;
const base64Options = { alphabet: "base64url", omitPadding: true };
const encode = (value) => value.toBase64(base64Options);
const decode = (value) => Uint8Array.fromBase64(value, { alphabet: "base64url" });
const jwtHeader = encode(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));

function sessionKey(secret) {
    if (typeof secret !== "string" || secret.length < 32) {
        throw new Error("JWT_SECRET must be at least 32 characters");
    }

    return crypto.subtle.importKey(
        "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"],
    );
}

async function clientHash(key, ip) {
    const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(`client:${ip}`));
    return encode(new Uint8Array(digest));
}

export async function createSession(turnstileResponse, ip, env) {
    if (!turnstileResponse || turnstileResponse.length > 2048 || !ip) return;

    const hostname = new URL(env.WEB_ORIGIN).hostname;
    const validation = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            secret: env.TURNSTILE_SECRET,
            response: turnstileResponse,
            remoteip: ip,
        }),
        redirect: "manual",
        signal: AbortSignal.timeout(5000),
    }).then(async (response) => {
        if (response.ok) return response.json();
        await response.body?.cancel();
    }).catch(() => null);

    if (validation?.success !== true || validation.hostname !== hostname) return;

    const key = await sessionKey(env.JWT_SECRET);
    const claims = {
        jti: encode(crypto.getRandomValues(new Uint8Array(8))),
        sub: await clientHash(key, ip),
        exp: Math.floor(Date.now() / 1000) + sessionLifetime,
    };
    const payload = encode(encoder.encode(JSON.stringify(claims)));
    const unsigned = `${jwtHeader}.${payload}`;
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(unsigned));

    return {
        token: `${unsigned}.${encode(new Uint8Array(signature))}`,
        exp: sessionLifetime - 2,
    };
}

export async function verifySession(authorization, ip, env) {
    if (!authorization || authorization.length > 256 || !ip) return false;

    const match = /^Bearer ([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/i.exec(authorization);
    if (!match || match[1] !== jwtHeader) return false;

    const [, header, payload, signature] = match;
    const key = await sessionKey(env.JWT_SECRET);

    try {
        const signatureBytes = decode(signature);
        if (encode(signatureBytes) !== signature) return false;

        const valid = await crypto.subtle.verify(
            "HMAC", key, signatureBytes, encoder.encode(`${header}.${payload}`),
        );
        if (!valid) return false;

        const claims = JSON.parse(decoder.decode(decode(payload)));
        return Number.isInteger(claims.exp)
            && claims.exp > Math.floor(Date.now() / 1000)
            && claims.sub === await clientHash(key, ip);
    } catch {
        return false;
    }
}
