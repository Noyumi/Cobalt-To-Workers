import { get } from "svelte/store";

import settings from "$lib/state/settings";
import cachedInfo from "$lib/state/server-info";
import { getCachedSession, getSession, resetSession } from "$lib/api/session";
import { getServerInfo } from "$lib/api/server-info";

import type { CobaltAPIResponse, CobaltErrorResponse, CobaltSaveRequestBody } from "$lib/types/api";

function requestError(code: string) {
    return { status: "error", error: { code } } as CobaltErrorResponse;
}

async function request(body: CobaltSaveRequestBody) {
    if (!await getServerInfo()) return requestError("error.api.unreachable");
    const server = get(cachedInfo)!;
    const origin = server.origin;
    const { turnstileSitekey } = server.info.cobalt;

    const send = async (authorization?: string): Promise<CobaltAPIResponse | undefined> => {
        const headers = new Headers({
            Accept: "application/json",
            "Content-Type": "application/json",
        });
        if (authorization) headers.set("Authorization", authorization);

        try {
            const response = await fetch(origin, {
                method: "POST",
                redirect: "manual",
                signal: AbortSignal.timeout(20_000),
                body: JSON.stringify(body),
                headers,
            });
            return await response.json();
        } catch (error) {
            if (error instanceof Error && error.name === "TimeoutError") {
                return requestError("error.api.timed_out");
            }
        }
    };

    const { enableCustomApiKey, customApiKey } = get(settings).processing;
    if (enableCustomApiKey && customApiKey) return send(`Api-Key ${customApiKey}`);

    const cached = getCachedSession(origin);
    let response = await send(cached && `Bearer ${cached.token}`);
    if (cached && response?.status === "error" && response.error.code === "error.api.auth.jwt.invalid") {
        resetSession(origin);
        response = await send();
    }

    if (turnstileSitekey && response?.status === "error" && response.error.code === "error.api.auth.jwt.missing") {
        const session = await getSession(origin, turnstileSitekey);
        if ("error" in session) return session;
        return send(`Bearer ${session.token}`);
    }

    return response;
}

const probeCobaltTunnel = async (url: string) => {
    const response = await fetch(`${url}&p=1`).catch(() => {});
    return response?.status === 200 ? 200 : 0;
}

export default { request, probeCobaltTunnel };
