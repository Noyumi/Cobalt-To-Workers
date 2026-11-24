const cachedID = {
    version: '',
    id: ''
}

async function findClientID(fetcher) {
    try {
        const sc = await fetcher('https://soundcloud.com/').then(r => r.text());
        const scVersion = sc.match(/window\.__sc_version="(\d{10})"/)?.[1];

        if (scVersion && cachedID.version === scVersion) {
            return cachedID.id;
        }

        let clientid = sc.match(/"hydratable"\s*:\s*"apiClient"\s*,\s*"data"\s*:\s*\{\s*"id"\s*:\s*"([^"]+)"/)?.[1];
        if (!clientid) {
            const scripts = [...sc.matchAll(/<script[^>]+src="(https:\/\/a-v2\.sndcdn\.com\/[^"]+)"/g)];

            for (const script of scripts.reverse().slice(0, 8)) {
                const url = script[1];
                const scrf = await fetcher(url).then(r => r.text()).catch(() => "");
                clientid = scrf.match(/[,\s{]client_id:"([A-Za-z0-9]{32})"/)?.[1];
                if (clientid) break;
            }
        }

        if (clientid) {
            cachedID.version = scVersion;
            cachedID.id = clientid;
        }

        return clientid;
    } catch {}
}

const findBestForPreset = (transcodings, preset) => {
    let inferior;
    for (const entry of transcodings) {
        const protocol = entry?.format?.protocol;

        if (entry.snipped || protocol?.includes('encrypted')) {
            continue;
        }

        if (entry?.preset?.startsWith(`${preset}_`)) {
            if (protocol === 'progressive') {
                return entry;
            }

            inferior = entry;
        }
    }

    return inferior;
}

export async function searchSoundCloudTracks(query, fetcher) {
    const clientId = await findClientID(fetcher);
    if (!clientId) return;

    const url = new URL("https://api-v2.soundcloud.com/search/tracks");
    url.search = new URLSearchParams({ q: query, limit: "16", client_id: clientId });
    const data = await fetcher(url)
        .then(response => response.ok ? response.json() : undefined)
        .catch(() => undefined);

    if (Array.isArray(data?.collection)) return { clientId, tracks: data.collection };
}

export default async function(obj) {
    const { fetcher = fetch, resolveRedirectingURL, durationLimit, fragmentedAAC } = obj;
    const clientId = obj.clientId ?? await findClientID(fetcher);
    if (!clientId) return { error: "fetch.fail" };

    let link;

    if (obj.shortLink) {
        obj = {
            ...obj,
            ...await resolveRedirectingURL(
                `https://on.soundcloud.com/${obj.shortLink}`
            )
        }
    }

    if (obj.author && obj.song) {
        link = `https://soundcloud.com/${obj.author}/${obj.song}`;
        if (obj.accessKey) {
            link += `/s-${obj.accessKey}`;
        }
    }

    if (!link && obj.shortLink) return { error: "fetch.short_link" };
    if (!link) return { error: "link.unsupported" };

    const resolveURL = new URL("https://api-v2.soundcloud.com/resolve");
    resolveURL.searchParams.set("url", link);
    resolveURL.searchParams.set("client_id", clientId);

    const json = await fetcher(resolveURL).then(r => r.json()).catch(() => {});
    if (!json) return { error: "fetch.fail" };
    if (obj.trackId !== undefined && json.id !== obj.trackId) return { error: "spotify.no_match" };

    if (json.duration > durationLimit * 1000) {
        return { error: "content.too_long" };
    }

    if (json.policy === "BLOCK" || json.access === "blocked") {
        return { error: "content.region" };
    }

    if (json.policy === "SNIP") {
        return { error: "content.paid" };
    }

    if (!json.media?.transcodings?.length) {
        return { error: "fetch.empty" };
    }

    let bestAudio = "opus",
        selectedStream = findBestForPreset(json.media.transcodings, "opus");

    const mp3Media = findBestForPreset(json.media.transcodings, "mp3");

    // use mp3 if present if user prefers it or if opus isn't available
    if (mp3Media && (obj.format === "mp3" || !selectedStream)) {
        selectedStream = mp3Media;
        bestAudio = "mp3"
    }

    if (fragmentedAAC && selectedStream?.format.protocol !== "progressive") {
        selectedStream = ["aac_160k", "aac_96k"]
            .map(preset => json.media.transcodings.find(entry => !entry.snipped
                && entry.preset === preset
                && entry.format?.protocol === "hls"
                && entry.format?.mime_type?.startsWith("audio/mp4")))
            .find(Boolean);
        bestAudio = "m4a";
    }

    if (!selectedStream) {
        return { error: "fetch.empty" };
    }

    const fileUrl = new URL(selectedStream.url);
    fileUrl.searchParams.set("client_id", clientId);
    fileUrl.searchParams.set("track_authorization", json.track_authorization);

    const file = await fetcher(fileUrl)
                     .then(async r => new URL((await r.json()).url))
                     .catch(() => {});

    if (!file) return { error: "fetch.empty" };

    const artist = json.user?.username?.trim();
    const fileMetadata = {
        title: json.title?.trim(),
        album: json.publisher_metadata?.album_title?.trim(),
        artist,
        album_artist: artist,
        composer: json.publisher_metadata?.writer_composer?.trim(),
        genre: json.genre?.trim(),
        date: json.display_date?.trim().slice(0, 10),
        copyright: json.license?.trim(),
    }

    let cover;
    if (json.artwork_url && obj.includeCover !== false) {
        const coverUrl = json.artwork_url.replace(/-large/, "-t1080x1080");
        const testCover = await fetcher(coverUrl)
            .then(async r => {
                await r.body?.cancel();
                return r.status === 200;
            })
            .catch(() => {});

        if (testCover) {
            cover = coverUrl;
        }
    }

    return {
        urls: file.toString(),
        cover,
        filenameAttributes: {
            service: "soundcloud",
            id: json.id,
            ...fileMetadata
        },
        bestAudio,
        fileMetadata,
        isHLS: selectedStream.format.protocol === "hls" || file.pathname.endsWith('.m3u8'),
    }
}
