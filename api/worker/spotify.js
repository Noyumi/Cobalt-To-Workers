import { extract, normalizeURL } from "../src/processing/link.js";
import soundcloud, { searchSoundCloudTracks } from "../src/processing/services/soundcloud.js";

const soundCloudServices = new Set(["soundcloud"]);

function normalizeName(name) {
    return typeof name === "string"
        ? name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()
        : "";
}

function matchesDuration(value, duration) {
    const tolerance = Math.min(3000, Math.max(1000, duration * 0.03));
    return Number.isFinite(value) && value > 0 && Math.abs(value - duration) <= tolerance;
}

function matchesTitle(value, title, artist) {
    const normalized = normalizeName(value);
    return normalized === title || normalized === artist + " " + title;
}

async function readSpotifyTrack(id, fetcher, userAgent) {
    try {
        const response = await fetcher("https://open.spotify.com/embed/track/" + id, {
            headers: { "User-Agent": userAgent, "Accept-Language": "en-US,en;q=0.9" },
        });
        if (!response.ok) {
            await response.body?.cancel();
            return;
        }
        const html = await response.text();
        const data = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
        const track = data && JSON.parse(data)?.props?.pageProps?.state?.data?.entity;
        if (track?.type === "track" && (track.id === id || track.uri === "spotify:track:" + id)) return track;
    } catch {
        return;
    }
}

function findRecording(tracks, title, artist, duration, isrc) {
    const expectedTitle = normalizeName(title);
    const expectedArtist = normalizeName(artist);
    if (!expectedTitle || !expectedArtist) return;

    const candidates = [];
    for (const track of tracks) {
        if (!Number.isSafeInteger(track?.id) || typeof track.title !== "string"
            || track.policy === "BLOCK" || track.policy === "SNIP" || track.access === "blocked"
            || track.sharing === "private" || track.streamable === false) continue;

        const trackDuration = track.full_duration ?? track.duration;
        if (!matchesDuration(trackDuration, duration)) continue;

        const uploader = normalizeName(track.user?.username);
        const creditedArtist = normalizeName(track.publisher_metadata?.artist);
        if (uploader !== expectedArtist && creditedArtist !== expectedArtist) continue;

        const trackTitle = track.title.replace(/\s*\[NCS Release\]\s*$/i, "");
        if (!matchesTitle(trackTitle, expectedTitle, expectedArtist)) continue;

        const recordingCode = normalizeName(track.publisher_metadata?.isrc);
        if (isrc && recordingCode && recordingCode !== isrc) continue;

        const url = URL.parse(track.permalink_url);
        if (url?.origin !== "https://soundcloud.com") continue;
        const parsed = extract(normalizeURL(url.href), soundCloudServices);
        if (parsed.host !== "soundcloud" || !parsed.patternMatch.author
            || !parsed.patternMatch.song || parsed.patternMatch.accessKey) continue;

        const sameUploader = uploader === expectedArtist;
        const priority = (isrc && recordingCode === isrc ? 4 : 0)
            + (sameUploader ? 1 : 0) + (sameUploader && track.user?.verified === true ? 2 : 0);
        candidates.push({ id: track.id, recordingCode, priority, link: parsed.patternMatch });
    }

    candidates.sort((a, b) => b.priority - a.priority);
    const [best, ...others] = candidates;
    if (best && !others.some(candidate => candidate.priority === best.priority && candidate.id !== best.id
        && (!best.recordingCode || candidate.recordingCode !== best.recordingCode))) return best;
}

async function resolveSoundCloud(query, options, title, artist, duration, isrc) {
    const search = await searchSoundCloudTracks(query, options.fetcher);
    if (!search) return;
    const match = findRecording(search.tracks, title, artist, duration, isrc);
    if (!match) return;

    const result = await soundcloud({
        ...options, ...match.link, clientId: search.clientId, trackId: match.id, fragmentedAAC: true,
    });
    if (!result.error) return { ...result, mediaService: "soundcloud" };
}

async function resolveYouTube(query, options, title, artist, duration) {
    const { default: youtube, searchYoutubeAudio } = await import("./youtube.js");
    const expectedTitle = normalizeName(title);
    const expectedArtist = normalizeName(artist);
    if (!expectedTitle || !expectedArtist) return;

    const tried = new Set();
    for await (const candidates of searchYoutubeAudio(query, options.fetcher)) {
        const match = candidates.find(candidate => {
            if (!/^[A-Za-z0-9_-]{11}$/.test(candidate.id) || tried.has(candidate.id)
                || !matchesDuration(candidate.duration * 1000, duration)) return false;
            const name = candidate.title?.replace(/\s*[(\[](?:official (?:audio|(?:music )?video)|lyrics?|lyric video)[)\]]\s*$/i, "");
            return matchesTitle(name, expectedTitle, expectedArtist)
                && candidate.artists.some(name => normalizeName(name) === expectedArtist);
        });
        if (!match) continue;
        tried.add(match.id);

        const audio = await youtube({
            ...options,
            id: match.id,
            isAudioOnly: true,
            probeMedia: (url, length) => options.probeMedia(url, length, "youtube"),
            validateDuration: seconds => matchesDuration(seconds * 1000, duration),
        });
        if (!audio.error) return { ...audio, mediaService: "youtube" };
    }
}

export default async function spotify(options) {
    const { id, fetcher, userAgent, durationLimit, audioServices } = options;
    const track = await readSpotifyTrack(id, fetcher, userAgent);
    const title = track?.name ?? track?.title;
    const artist = track?.artists?.[0]?.name;
    const duration = track?.duration;
    if (typeof title !== "string" || !title.trim() || typeof artist !== "string" || !artist.trim()
        || !Number.isFinite(duration) || duration <= 0) return { error: "fetch.fail" };
    if (duration > durationLimit * 1000) return { error: "content.too_long" };

    const query = artist + " " + title;
    const isrc = normalizeName(track.isrc ?? track.externalIds?.isrc);
    const audio = (audioServices.has("soundcloud") ? await resolveSoundCloud(query, options, title, artist, duration, isrc) : undefined)
        ?? (audioServices.has("youtube") ? await resolveYouTube(query, options, title, artist, duration) : undefined);
    if (!audio) return { error: "spotify.no_match" };
    return {
        ...audio,
        filenameAttributes: { ...audio.filenameAttributes, title, author: artist },
        fileMetadata: { ...audio.fileMetadata, title, artist, album_artist: artist },
        isAudioOnly: true,
    };
}
