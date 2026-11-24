import { verifyWithTurnstile } from "$lib/state/turnstile";
import type { CobaltErrorResponse, CobaltSession, CobaltSessionResponse } from "$lib/types/api";

let cache: { origin: string, session: CobaltSession } | undefined;
const pending = new Map<string, Promise<CobaltSessionResponse>>();

const now = () => Math.floor(Date.now() / 1000);

function sessionError(code: string) {
    return { status: "error", error: { code } } as CobaltErrorResponse;
}

export function getCachedSession(origin: string) {
    if (cache?.origin === origin && cache.session.exp > now() + 2) return cache.session;
}

export function resetSession(origin: string) {
    if (cache?.origin === origin) cache = undefined;
}

async function requestSession(origin: string, sitekey: string): Promise<CobaltSessionResponse> {
    const verification = await verifyWithTurnstile(sitekey);
    if ("error" in verification) return sessionError(verification.error);

    try {
        const response = await fetch(`${origin}/session`, {
            method: "POST",
            redirect: "manual",
            signal: AbortSignal.timeout(10_000),
            headers: { "cf-turnstile-response": verification.token },
        });
        const session: CobaltSessionResponse = await response.json();
        if (!("status" in session)) {
            session.exp += now();
            cache = { origin, session };
        }
        return session;
    } catch (error) {
        return sessionError(error instanceof Error && error.name === "TimeoutError"
            ? "error.api.timed_out"
            : "error.api.unreachable");
    }
}

export function getSession(origin: string, sitekey: string) {
    const session = getCachedSession(origin);
    if (session) return Promise.resolve(session);

    const current = pending.get(origin);
    if (current) return current;

    const request = requestSession(origin, sitekey).finally(() => pending.delete(origin));
    pending.set(origin, request);
    return request;
}
