import { isMediaURLAllowed } from "./tunnel.js";

function imageURL(value) {
    if (!isMediaURLAllowed("twitter", value)) return;
    const url = new URL(value);
    if (url.hostname !== "pbs.twimg.com" || !url.pathname.startsWith("/media/")) return;
    url.searchParams.set("name", "orig");
    return url;
}

function mediaItem(media, filename, durationLimit) {
    const photo = imageURL(media?.media_url_https);
    if (media?.type === "photo" && photo) {
        const format = photo.searchParams.get("format") ?? photo.pathname.split(".").at(-1);
        const extension = /^(?:jpe?g|png|webp)$/i.test(format) ? format.toLowerCase() : "jpg";
        return { type: "photo", url: photo.href, thumb: photo.href, filename: filename + "." + extension };
    }
    if (media?.type !== "video" && media?.type !== "animated_gif") return;
    if (media.video_info?.duration_millis > durationLimit * 1000) return;

    const mp4 = (media.video_info?.variants ?? [])
        .filter(variant => variant.content_type === "video/mp4" && isMediaURLAllowed("twitter", variant.url)
            && new URL(variant.url).hostname === "video.twimg.com")
        .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
    if (!mp4) return;
    return { type: media.type === "animated_gif" ? "gif" : "video", url: mp4.url, thumb: photo?.href, filename: filename + ".mp4" };
}

export default async function twitter({ id, index, fetcher, durationLimit }) {
    if (!/^\d{1,22}$/.test(id ?? "")) return { error: "fetch.empty" };
    const url = new URL("https://cdn.syndication.twimg.com/tweet-result");
    // The public embed endpoint derives this parameter from the post ID.
    const token = ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
    url.search = new URLSearchParams({ id, token });

    const response = await fetcher(url, { headers: { Accept: "application/json" } }).catch(() => undefined);
    if (!response?.ok) {
        await response?.body?.cancel();
        return { error: response?.status === 404 ? "fetch.empty" : "fetch.fail" };
    }
    const post = await response.json().catch(() => undefined);
    if (post?.id_str !== id || !Array.isArray(post.mediaDetails)) return { error: "fetch.empty" };

    const filename = "twitter_" + id;
    const media = post.mediaDetails;
    if (index !== undefined) {
        const selected = media[Number(index) - 1];
        if (!selected) return { error: "fetch.empty" };
        return singleItem(selected, filename + "_" + index, durationLimit);
    }
    if (media.length === 1) return singleItem(media[0], filename, durationLimit);

    const picker = media.slice(0, 20)
        .map((item, i) => mediaItem(item, filename + "_" + (i + 1), durationLimit))
        .filter(Boolean);
    return picker.length ? { picker } : { error: "fetch.empty" };
}

function singleItem(media, filename, durationLimit) {
    if (media?.video_info?.duration_millis > durationLimit * 1000) return { error: "content.too_long" };
    const item = mediaItem(media, filename, durationLimit);
    if (!item) return { error: "fetch.empty" };
    return {
        urls: item.url,
        filename: item.filename,
        isPhoto: item.type === "photo",
        isGif: item.type === "gif",
        audioFilename: filename + "_audio",
    };
}
