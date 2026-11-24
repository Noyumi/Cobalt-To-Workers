import { isMediaURLAllowed } from "./tunnel.js";

const validId = /^[A-Za-z0-9_-]{1,36}$/;

function mediaFromEmbed(html, id) {
    const encoded = html.match(/"contextJSON"\s*:\s*("(?:[^"\\]|\\.)*")/)?.[1];
    if (!encoded) return;

    try {
        const data = JSON.parse(JSON.parse(encoded))?.gql_data;
        const media = data?.shortcode_media ?? data?.xdt_shortcode_media;
        if (media?.shortcode === id) return media;
    } catch {
        return;
    }
}

function mediaItem(media, filename, durationLimit) {
    const photo = isMediaURLAllowed("instagram", media?.display_url) ? media.display_url : undefined;
    if (media?.is_video) {
        if (!isMediaURLAllowed("instagram", media.video_url) || media.video_duration > durationLimit) return;
        return { type: "video", url: media.video_url, thumb: photo, filename: filename + ".mp4" };
    }
    if (photo) return { type: "photo", url: photo, thumb: photo, filename: filename + ".jpg" };
}

export default async function instagram({ postId, shareId, resolveRedirectingURL, fetcher, durationLimit }) {
    if (!postId && validId.test(shareId ?? "")) {
        const result = await resolveRedirectingURL("https://www.instagram.com/share/" + shareId + "/").catch(() => undefined);
        postId = result?.postId;
        if (!postId) return { error: "fetch.short_link" };
    }
    if (!validId.test(postId ?? "")) return { error: "link.unsupported", context: { service: "instagram" } };

    const response = await fetcher("https://www.instagram.com/p/" + postId + "/embed/").catch(() => undefined);
    if (!response?.ok) {
        await response?.body?.cancel();
        return { error: response?.status === 404 ? "fetch.empty" : "fetch.fail" };
    }
    const html = await response.text().catch(() => undefined);
    if (html === undefined) return { error: "fetch.fail" };

    const media = mediaFromEmbed(html, postId);
    if (!media) return { error: "fetch.empty" };
    const filename = "instagram_" + postId;
    const children = media.edge_sidecar_to_children?.edges;
    if (Array.isArray(children)) {
        const picker = children.slice(0, 20)
            .map((child, index) => mediaItem(child?.node, filename + "_" + (index + 1), durationLimit))
            .filter(Boolean);
        return picker.length ? { picker } : { error: "fetch.empty" };
    }

    if (media.video_duration > durationLimit) return { error: "content.too_long" };
    const item = mediaItem(media, filename, durationLimit);
    if (!item) return { error: "fetch.empty" };
    return { urls: item.url, filename: item.filename, isPhoto: item.type === "photo", audioFilename: filename + "_audio" };
}
