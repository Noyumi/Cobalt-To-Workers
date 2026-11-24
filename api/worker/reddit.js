import { isMediaURLAllowed } from "./tunnel.js";

const validId = /^[A-Za-z0-9]{1,16}$/;

function attribute(tag, name) {
    return tag.match(new RegExp("\\b" + name + '="([^"]*)"'))?.[1]?.replaceAll("&amp;", "&");
}

async function readText(fetcher, url) {
    try {
        const response = await fetcher(url);
        if (response.ok) return await response.text();
        await response.body?.cancel();
    } catch {
        return;
    }
}

function durationSeconds(manifest) {
    const time = attribute(manifest, "mediaPresentationDuration");
    const [, hours = 0, minutes = 0, seconds = 0] = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(time ?? "") ?? [];
    return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

function mediaTracks(manifest, manifestURL, quality) {
    const video = [];
    const audio = [];
    for (const [, group, entries] of manifest.matchAll(/<AdaptationSet\b([^>]*)>([\s\S]*?)<\/AdaptationSet>/g)) {
        const groupMime = attribute(group, "mimeType");
        for (const [, properties, entry] of entries.matchAll(/<Representation\b([^>]*)>([\s\S]*?)<\/Representation>/g)) {
            const mime = attribute(properties, "mimeType") ?? groupMime;
            const tracks = mime === "video/mp4" ? video : mime === "audio/mp4" ? audio : undefined;
            if (!tracks) continue;
            const base = entry.match(/<BaseURL>([^<]+)<\/BaseURL>/)?.[1]?.trim().replaceAll("&amp;", "&");
            const url = base && URL.parse(base, manifestURL);
            if (!url || !isMediaURLAllowed("reddit", url) || !url.pathname.endsWith(".mp4")) continue;
            tracks.push({ url: url.href, height: Number(attribute(properties, "height")), bitrate: Number(attribute(properties, "bandwidth")) });
        }
    }

    video.sort((a, b) => b.height - a.height || b.bitrate - a.bitrate);
    audio.sort((a, b) => b.bitrate - a.bitrate);
    const bestVideo = quality === "max" ? video[0] : video.find(track => track.height <= Number(quality)) ?? video.at(-1);
    return { video: bestVideo?.url, audio: audio[0]?.url };
}

export default async function reddit({ id, shortId, sub, shareId, resolveRedirectingURL, fetcher, quality, durationLimit }) {
    let manifestURL;
    if (validId.test(shortId ?? "")) {
        id = shortId;
        manifestURL = new URL("https://v.redd.it/" + shortId + "/DASHPlaylist.mpd");
    } else if (/^\w{1,32}$/.test(sub ?? "") && validId.test(shareId ?? "")) {
        const shared = "https://www.reddit.com/r/" + sub + "/s/" + shareId;
        id = (await resolveRedirectingURL(shared).catch(() => undefined))?.id;
        if (!id) return { error: "fetch.short_link" };
    }
    if (!validId.test(id ?? "")) return { error: "fetch.empty" };

    if (!manifestURL) {
        const embed = await readText(fetcher, "https://www.redditmedia.com/mediaembed/" + id);
        if (embed === undefined) return { error: "fetch.fail" };
        const player = embed.match(new RegExp('<div\\b[^>]*\\bid="video-' + id + '"[^>]*>'))?.[0];
        manifestURL = player && URL.parse(attribute(player, "data-mpd-url"));
    }
    if (!manifestURL || !isMediaURLAllowed("reddit", manifestURL)) return { error: "fetch.empty" };

    const manifest = await readText(fetcher, manifestURL);
    if (manifest === undefined) return { error: "fetch.fail" };
    if (durationSeconds(manifest) > durationLimit) return { error: "content.too_long" };
    const tracks = mediaTracks(manifest, manifestURL, quality);
    if (!tracks.video) return { error: "fetch.empty" };

    const name = "reddit_" + id;
    return {
        urls: tracks.audio ? [tracks.video, tracks.audio] : tracks.video,
        typeId: tracks.audio ? "tunnel" : "redirect",
        type: tracks.audio ? "merge" : "proxy",
        filename: name + ".mp4",
        audioFilename: name + "_audio",
    };
}
