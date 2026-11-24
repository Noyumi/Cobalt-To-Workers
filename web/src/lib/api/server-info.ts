import { get } from "svelte/store";
import { currentApiURL } from "$lib/api/api-url";
import cachedInfo from "$lib/state/server-info";
import type { CobaltServerInfoResponse, CobaltErrorResponse, CobaltServerInfo } from "$lib/types/api";

export type CobaltServerInfoCache = {
    info: CobaltServerInfo,
    origin: string,
}

const request = async (origin: string) => {
    const apiEndpoint = `${origin}/`;

    const response: CobaltServerInfoResponse = await fetch(apiEndpoint, {
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
    })
    .then(r => r.json())
    .catch((e) => {
        if (e?.message?.includes("timed out")) {
            return {
                status: "error",
                error: {
                    code: "error.api.timed_out"
                }
            } as CobaltErrorResponse
        }
    });

    return response;
}

export const getServerInfo = async () => {
    const origin = currentApiURL();
    if (get(cachedInfo)?.origin === origin) return true;

    const freshInfo = await request(origin);
    if (!freshInfo || !("cobalt" in freshInfo) || origin !== currentApiURL()) {
        return false;
    }

    cachedInfo.set({ info: freshInfo, origin });
    return true;
}
