import Cookie from "../cookie/cookie.js";

import { convertLanguageCode } from "../../misc/language-codes.js";

const shortDomain = "https://vt.tiktok.com/";

function mediaURL(value) {
    const urls = [value?.UrlList ?? value?.urlList ?? value].flat();
    return urls.find(url => typeof url === "string" && url.startsWith("https://"));
}

async function shortPostId(shortLink, fetcher, userAgent) {
    const res = await fetcher(new URL(encodeURIComponent(shortLink), shortDomain), {
        redirect: "manual",
        headers: { "user-agent": userAgent.split(" Chrome/1")[0] },
    });
    const location = res.headers.get("Location");
    const target = location ?? (await res.text()).match(/^<a href="(https:\/\/[^"]+)"/)?.[1];
    if (location) await res.body?.cancel();

    const url = target && URL.parse(target, shortDomain);
    if (!url || url.protocol !== "https:" || !["www.tiktok.com", "tiktok.com", "m.tiktok.com"].includes(url.hostname)) return;
    return url.pathname.match(/^\/@[^/]+\/(?:video|photo)\/(\d{10,21})\/?$/)?.[1];
}

export default async function(obj) {
    const { fetcher = fetch, userAgent, updateCookie, createStream } = obj;
    const cookie = updateCookie ? new Cookie({}) : undefined;
    const postId = obj.postId ?? await shortPostId(obj.shortLink, fetcher, userAgent).catch(() => undefined);
    if (!postId) return { error: "fetch.short_link" };
    if (!/^\d{10,21}$/.test(postId)) return { error: "link.unsupported" };

    // should always be /video/, even for photos
    const headers = { "user-agent": userAgent };
    if (cookie) headers.cookie = cookie;
    const res = await fetcher(`https://www.tiktok.com/@i/video/${postId}`, { headers });
    if (cookie) updateCookie(cookie, res.headers);

    const html = await res.text();

    let detail;
    try {
        const json = html.match(/<script\b[^>]*\bid="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/)?.[1];

        const data = JSON.parse(json);
        const videoDetail = data["__DEFAULT_SCOPE__"]["webapp.video-detail"];

        if (!videoDetail) throw "no video detail found";

        // status_deleted or etc
        if (videoDetail.statusCode || videoDetail.statusMsg) {
            return { error: "content.post.unavailable"};
        }

        detail = videoDetail?.itemInfo?.itemStruct;
    } catch {
        return { error: "fetch.fail" };
    }

    if (!detail?.author || detail.privateItem) {
        return { error: "content.post.unavailable" };
    }
    if (detail.isContentClassified) {
        return { error: "content.post.age" };
    }

    let video, videoFilename, audioFilename, audio, images,
        filenameBase = `tiktok_${detail.author?.uniqueId}_${postId}`,
        bestAudio; // will get defaulted to m4a later on in match-action

    images = detail.imagePost?.images;

    let playAddr = mediaURL(detail.video?.playAddr) ?? mediaURL(detail.video?.downloadAddr);

    if (obj.h265) {
        const h265PlayAddr = mediaURL(detail.video?.bitrateInfo?.find(b => b.CodecType?.includes("h265"))?.PlayAddr);
        playAddr = h265PlayAddr || playAddr
    }

    if (!obj.isAudioOnly && !images) {
        video = playAddr;
        videoFilename = `${filenameBase}.mp4`;
    } else {
        audio = playAddr;
        audioFilename = `${filenameBase}_audio`;

        if (obj.fullAudio || !audio) {
            audio = detail.music?.private ? undefined : mediaURL(detail.music?.playUrl);
            audioFilename += `_original`
        }
        if (audio?.includes("mime_type=audio_mpeg")) bestAudio = 'mp3';
    }

    if (video) {
        let subtitles, fileMetadata;
        if (obj.subtitleLang && detail?.video?.subtitleInfos?.length) {
            const langCode = convertLanguageCode(obj.subtitleLang);
            const subtitle = detail?.video?.subtitleInfos.find(
                s => s.LanguageCodeName.startsWith(langCode) && s.Format === "webvtt"
            )
            if (subtitle) {
                subtitles = subtitle.Url;
                fileMetadata = {
                    sublanguage: langCode,
                }
            }
        }
        return {
            urls: video,
            subtitles,
            fileMetadata,
            filename: videoFilename,
            headers: cookie && { cookie }
        }
    }

    if (images && obj.isAudioOnly && audio) {
        return {
            urls: audio,
            audioFilename: audioFilename,
            isAudioOnly: true,
            bestAudio,
            headers: cookie && { cookie }
        }
    }

    if (images?.length && !obj.isAudioOnly) {
        const urls = images.map(i => {
            const list = i.imageURL?.urlList ?? [];
            return mediaURL(list.find(url => url?.includes(".jpeg?"))) ?? mediaURL(list);
        }).filter(Boolean);
        if (!urls.length) return { error: "fetch.empty" };

        const imageLinks = await Promise.all(urls.map(async (url, i) => {
            if (obj.alwaysProxy) url = await createStream({
                service: "tiktok",
                type: "proxy",
                url,
                filename: `${filenameBase}_photo_${i + 1}.jpg`,
            });

            return { type: "photo", url };
        }));

        return {
            picker: imageLinks,
            urls: audio,
            audioFilename: audioFilename,
            isAudioOnly: true,
            bestAudio,
            headers: cookie && { cookie }
        }
    }

    if (audio) {
        return {
            urls: audio,
            audioFilename: audioFilename,
            isAudioOnly: true,
            bestAudio,
            headers: cookie && { cookie }
        }
    }

    return { error: "fetch.empty" };
}
