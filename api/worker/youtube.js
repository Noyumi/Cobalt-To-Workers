import { Innertube } from "youtubei.js/cf-worker";

const codecs = {
    h264: { video: "avc1", audio: "mp4a", container: "mp4" },
    vp9: { video: "vp9", audio: "opus", container: "webm" },
    av1: { video: "av01", audio: "opus", container: "webm" },
};

function bestVideo(formats, quality) {
    const sorted = [...formats].sort((a, b) => {
        const resolution = format => Math.min(format.height, format.width);
        return resolution(b) - resolution(a) || b.bitrate - a.bitrate;
    });
    return sorted.find(format => Math.min(format.height, format.width) <= quality) ?? sorted.at(-1);
}

export default async function youtube({ id, fetcher, probeMedia, isAudioOnly, isAudioMuted, params, durationLimit }) {
    const client = await Innertube.create({
        fetch: fetcher,
        generate_session_locally: true,
        retrieve_player: false,
    });

    const getInfo = name => client.getBasicInfo(id, { client: name }).catch(() => undefined);
    const isPlayable = result => result?.playability_status?.status === "OK" && result.basic_info?.id === id;
    const ios = await getInfo("IOS");
    const info = isPlayable(ios) ? ios : await getInfo("ANDROID");
    if (!isPlayable(info)) {
        return { error: ios || info ? "content.video.unavailable" : "fetch.fail" };
    }

    const metadata = { title: info.basic_info.title, artist: info.basic_info.author };
    const filenameAttributes = { service: "youtube", id, title: metadata.title, author: metadata.artist };
    if (info.basic_info.is_live) return { error: "content.video.live" };
    if (info.basic_info.duration > durationLimit) return { error: "content.too_long" };

    const isDirect = format => Boolean(format.url && !format.drm_families?.length);
    const muxedMp4 = formats => (formats ?? []).filter(format => isDirect(format)
        && format.has_video && format.has_audio && format.mime_type.startsWith("video/mp4"));
    const available = (format) => probeMedia(format.url, format.content_length);
    const adaptive = (info.streaming_data?.adaptive_formats ?? []).filter(isDirect);
    const audio = adaptive.filter(format => format.has_audio && !format.has_video);
    const playbackChecks = new Map();
    async function bestAudio(codec) {
        const tracks = audio.filter(format => format.mime_type.includes(codec))
            .sort((a, b) => Number(Boolean(b.is_original)) - Number(Boolean(a.is_original))
                || Number(Boolean(a.is_drc)) - Number(Boolean(b.is_drc))
                || b.bitrate - a.bitrate);
        for (const track of tracks.slice(0, 3)) {
            if (!playbackChecks.has(track.url)) playbackChecks.set(track.url, await available(track));
            if (playbackChecks.get(track.url)) return track;
        }
    }

    async function findCombinedMp4(select) {
        let format = await select(muxedMp4(info.streaming_data?.formats));
        const attempts = info === ios ? 2 : 1;
        for (let attempt = 0; !format && attempt < attempts; attempt++) {
            const android = await getInfo("ANDROID");
            if (!isPlayable(android)) break;
            format = await select(muxedMp4(android.streaming_data?.formats));
        }
        return format;
    }

    if (isAudioOnly) {
        const wantsMp4 = params.audioFormat === "best" && params.youtubeVideoCodec === "h264";
        const format = (wantsMp4 ? await bestAudio("mp4a") : undefined)
            ?? await bestAudio("opus")
            ?? await bestAudio("mp4a");
        if (format) {
            return {
                urls: format.url,
                filenameAttributes,
                fileMetadata: metadata,
                isAudioOnly: true,
                bestAudio: format.mime_type.includes("opus") ? "opus" : "m4a",
            };
        }

        const input = await findCombinedMp4(async formats => {
            const candidates = formats.filter(track => track.mime_type.includes("mp4a"))
                .sort((a, b) => a.bitrate - b.bitrate);
            for (const track of candidates.slice(0, 2)) {
                if (await available(track)) return track;
            }
        });
        if (!input) return { error: "youtube.no_matching_format" };

        return { urls: input.url, filenameAttributes, fileMetadata: metadata, isAudioOnly: true };
    }

    const quality = params.videoQuality === "max" ? Infinity : Number(params.videoQuality);
    const requiresWebm = params.youtubeVideoContainer === "webm";
    const preferredCodecs = [...new Set([params.youtubeVideoCodec, "h264", "vp9", "av1"])];
    for (const codec of preferredCodecs) {
        const { video: videoCodec, audio: audioCodec, container } = codecs[codec];
        if (requiresWebm && container !== "webm") continue;
        const video = bestVideo(adaptive.filter(format => format.has_video && format.mime_type.includes(videoCodec)), quality);
        if (!video) continue;
        const sound = isAudioMuted ? undefined : await bestAudio(audioCodec);
        if (!sound && !isAudioMuted) continue;
        if (!await available(video)) continue;

        const extension = params.youtubeVideoContainer === "auto" ? container : params.youtubeVideoContainer;
        let urls = [video.url];
        if (!isAudioMuted) urls.push(sound.url);
        if (isAudioMuted && extension !== container) urls = video.url;
        return {
            type: isAudioMuted ? "mute" : "merge",
            urls,
            filenameAttributes: {
                ...filenameAttributes,
                extension,
                resolution: `${video.width}x${video.height}`,
                qualityLabel: `${Math.min(video.width, video.height)}p`,
                youtubeFormat: codec,
            },
            fileMetadata: metadata,
        };
    }

    if (requiresWebm) return { error: "youtube.no_matching_format" };
    const muxed = await findCombinedMp4(async formats => {
        const candidate = bestVideo(formats, quality);
        if (candidate && await available(candidate)) return candidate;
    });
    if (!muxed) return { error: "youtube.no_matching_format" };

    const extension = params.youtubeVideoContainer === "auto" ? "mp4" : params.youtubeVideoContainer;
    return {
        type: extension === "mp4" ? "proxy" : "remux",
        urls: muxed.url,
        filenameAttributes: {
            ...filenameAttributes,
            extension,
            resolution: `${muxed.width}x${muxed.height}`,
            qualityLabel: `${Math.min(muxed.width, muxed.height)}p`,
            youtubeFormat: "h264",
        },
        fileMetadata: metadata,
    };
}
