import { get } from "svelte/store";
import { currentApiURL } from "$lib/api/api-url";
import cachedInfo from "$lib/state/server-info";
import type { CobaltServerInfoResponse, CobaltServerInfo } from "$lib/types/api";

export type CobaltServerInfoCache = {
    info: CobaltServerInfo,
    origin: string,
}

export const getServerInfo = async () => {
    const origin = currentApiURL();
    if (get(cachedInfo)?.origin === origin) return true;

    const freshInfo: CobaltServerInfoResponse | undefined = await fetch(`${origin}/`, {
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
    }).then(response => response.json()).catch(() => undefined);
    if (!freshInfo || typeof freshInfo !== "object" || !("cobalt" in freshInfo) || origin !== currentApiURL()) {
        return false;
    }

    cachedInfo.set({ info: freshInfo, origin });
    return true;
}
