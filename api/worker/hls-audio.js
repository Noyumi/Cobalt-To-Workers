import HLS from "hls-parser";

// One playlist, one initialization segment and up to 46 media requests fit the Free limit.
const maxSegments = 46;
const maxPlaylistBytes = 256 * 1024;

async function readPlaylist(response) {
    if (!response.ok || !response.body) throw new Error("HLS playlist unavailable");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    let bytes = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) return HLS.parse(text + decoder.decode());
            bytes += value.byteLength;
            if (bytes > maxPlaylistBytes) {
                await reader.cancel();
                throw new Error("HLS playlist is too large");
            }
            text += decoder.decode(value, { stream: true });
        }
    } finally {
        reader.releaseLock();
    }
}

export async function openHlsAudio(target, fetchSource, isAllowed) {
    const response = await fetchSource(target);
    const playlist = await readPlaylist(response);
    const { segments } = playlist;
    const initialization = segments?.[0]?.map;

    if (!playlist.endlist || !initialization?.uri || initialization.byterange
        || segments.length > maxSegments || segments.some(segment => segment.discontinuity
            || segment.gap || segment.byterange || segment.map?.uri !== initialization.uri
            || segment.map?.byterange || (segment.key && segment.key.method !== "NONE"))) {
        throw new Error("Unsupported HLS audio layout");
    }

    const base = response.url || target;
    const urls = [initialization.uri, ...segments.map(segment => segment.uri)].map(uri => new URL(uri, base));
    if (!urls.every(isAllowed)) throw new Error("HLS URL is outside the adapter allowlist");
    let index = 0;
    let reader;
    const abort = new AbortController();

    const body = new ReadableStream({
        async pull(controller) {
            for (;;) {
                if (!reader) {
                    if (index === urls.length) {
                        controller.close();
                        return;
                    }
                    const part = await fetchSource(urls[index++], abort.signal);
                    if (!part.ok || !part.body) {
                        await part.body?.cancel();
                        throw new Error("HLS segment unavailable");
                    }
                    reader = part.body.getReader();
                }
                const { done, value } = await reader.read();
                if (!done) {
                    controller.enqueue(value);
                    return;
                }
                reader.releaseLock();
                reader = undefined;
            }
        },
        async cancel(reason) {
            abort.abort(reason);
            await reader?.cancel(reason);
        },
    });
    return new Response(body, { headers: { "Content-Type": "audio/mp4" } });
}
