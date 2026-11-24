import { isMediaURLAllowed } from "./tunnel.js";

function parseJSON(value) {
    try {
        return JSON.parse(value);
    } catch {
        return;
    }
}

function readPin(html, id) {
    const props = html.match(/<script[^>]*id="__PWS_INITIAL_PROPS__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
    const pin = parseJSON(props)?.initialReduxState?.pins?.[id];
    if (pin) return pin;

    const relay = /<script[^>]*data-relay-completed-request="true"[^>]*>window\.__PWS_RELAY_REGISTER_COMPLETED_REQUEST__\("([^"]+)",([\s\S]*?)\);?\s*<\/script>/g;
    for (const [, encodedRequest, response] of html.matchAll(relay)) {
        let request;
        try {
            request = parseJSON(decodeURIComponent(encodedRequest));
        } catch {
            continue;
        }
        if (request?.variables?.pinId === id) {
            const pin = parseJSON(response)?.data?.v3GetPinQueryv2?.data;
            if (pin) return pin;
        }
    }
}

function videoRendition(videos, quality) {
    const resolution = item => Math.min(item.width, item.height);
    const mp4 = Object.values(videos?.videoList ?? videos?.video_list ?? {})
        .filter(item => isMediaURLAllowed("pinterest", item?.url)
            && new URL(item.url).pathname.endsWith(".mp4"))
        .sort((a, b) => resolution(b) - resolution(a));
    return mp4.find(item => resolution(item) <= Number(quality)) ?? (quality === "max" ? mp4[0] : mp4.at(-1));
}

export default async function pinterest({ id, shortLink, resolveRedirectingURL, fetcher, userAgent, quality, durationLimit }) {
    if (!id && /^[A-Za-z0-9_-]{1,32}$/.test(shortLink ?? "")) {
        id = (await resolveRedirectingURL("https://pin.it/" + shortLink).catch(() => undefined))?.id;
        if (!id) return { error: "fetch.short_link" };
    }
    id = id?.split("--").at(-1);
    if (!/^\d{1,24}$/.test(id ?? "")) return { error: "fetch.empty" };

    const response = await fetcher("https://www.pinterest.com/pin/" + id + "/", {
        headers: { "User-Agent": userAgent },
    }).catch(() => undefined);
    if (!response?.ok) {
        await response?.body?.cancel();
        return { error: response?.status === 404 ? "fetch.empty" : "fetch.fail" };
    }

    const html = await response.text().catch(() => undefined);
    if (html === undefined) return { error: "fetch.fail" };
    const pin = readPin(html, id);
    if (!pin) return { error: "fetch.empty" };
    const video = videoRendition(pin.videos, quality);
    if (video) {
        if (video.duration > durationLimit * 1000) return { error: "content.too_long" };
        return { urls: video.url, filename: "pinterest_" + id + ".mp4", audioFilename: "pinterest_" + id + "_audio" };
    }

    if (pin.videos || pin.isVideo || pin.storyPinData || pin.story_pin_data || pin.isEligibleForImageDownload === false) {
        return { error: "fetch.empty" };
    }
    const image = pin.images_orig?.url ?? pin.images?.orig?.url ?? pin.images_736x?.url ?? pin.images?.["736x"]?.url;
    if (!isMediaURLAllowed("pinterest", image)) return { error: "fetch.empty" };
    const extension = new URL(image).pathname.match(/\.(jpe?g|png|gif|webp)$/i)?.[1]?.toLowerCase();
    if (!extension) return { error: "fetch.empty" };
    return { urls: image, isPhoto: true, filename: "pinterest_" + id + "." + extension };
}
