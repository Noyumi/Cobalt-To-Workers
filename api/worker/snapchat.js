import { isMediaURLAllowed } from "./tunnel.js";

const videoMetadata = [
    'head meta[name="twitter:player:stream"]',
    'head meta[property="og:video:secure_url"]',
    'head link[rel="preload"][as="video"]',
].join(", ");

async function readSpotlightURL(response) {
    let source;
    let headEnded = false;
    const reader = new HTMLRewriter()
        .on(videoMetadata, {
            element(tag) {
                const value = (tag.getAttribute("content") ?? tag.getAttribute("href"))?.replaceAll("&amp;", "&");
                if (isMediaURLAllowed("snapchat", value)) source ??= value;
            },
        })
        .on("head", { element: tag => tag.onEndTag(() => { headEnded = true; }) })
        .transform(response).body.getReader();
    try {
        while (!source && !headEnded) {
            if ((await reader.read()).done) break;
        }
        return source;
    } finally {
        await reader.cancel().catch(() => undefined);
    }
}

export default async function snapchat({ spotlightId, shortLink, fetcher, resolveRedirectingURL, userAgent }) {
    if (!spotlightId && /^[A-Za-z0-9_-]{1,16}$/.test(shortLink ?? "")) {
        const target = await resolveRedirectingURL("https://t.snapchat.com/" + shortLink).catch(() => undefined);
        if (!target) return { error: "fetch.short_link" };
        spotlightId = target.spotlightId;
    }
    if (!/^[A-Za-z0-9_-]{1,255}$/.test(spotlightId ?? "")) return { error: "link.unsupported" };

    const response = await fetcher("https://www.snapchat.com/spotlight/" + spotlightId, {
        headers: { "User-Agent": userAgent },
    }).catch(() => undefined);
    if (!response?.ok) {
        await response?.body?.cancel();
        return { error: response?.status === 404 ? "fetch.empty" : "fetch.fail" };
    }

    const source = await readSpotlightURL(response).catch(() => undefined);
    if (!source) return { error: "fetch.empty" };

    const name = "snapchat_" + spotlightId;
    return { urls: source, filename: name + ".mp4", audioFilename: name + "_audio" };
}
