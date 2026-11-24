import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { unstable_getMiniflareWorkerOptions } from "wrangler";
import { createTunnel } from "../tunnel.js";

const api = "https://api.example.test";
const frontend = "https://web.example.test";
const clientIP = "203.0.113.10";
const streamableLink = "https://streamable.com/demo";
const media = "https://cdn.streamable.com/media.mp4";
const newgroundsLink = "https://www.newgrounds.com/portal/view/123";
const blueskyLink = "https://bsky.app/profile/example.test/post/gallery";
const image = "https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:test/photo@jpeg";
const soundCloudLink = "https://soundcloud.com/artist/track";
const soundCloudMedia = "https://playback.media-streaming.soundcloud.cloud";
const spotifyId = "1VsTvfmPwrJxIP5idldxX7";
const spotifyAmbiguousId = "4cOdK2wGLETKBW3PvgPWqT";
const spotifyMusicFallbackId = "61k7xAKMsuvTf2j2YnieSi";
const spotifyVideoFallbackId = "49EHDYNcguttNSuhZl2Hen";
const youtubeId = "jNQXAC9IVRw";
const youtubeFallbackId = "GBCzumHmzRk";
const youtubeCombinedOnlyId = "t1alternate";
let fallbackAndroidRequests = 0;
const tiktokVideo = "7195741644585454894";
const tiktokGallery = "7231234675476532526";
const settings = {
    API_URL: api,
    DISABLED_SERVICES: "",
    WEB_ORIGIN: frontend,
    TURNSTILE_SITEKEY: "test-sitekey",
    TURNSTILE_SECRET: "test-turnstile-secret",
    JWT_SECRET: "session-secret-for-tests-only-12345",
    TUNNEL_SECRET: Buffer.alloc(32, 1).toString("base64url"),
};
const requests = [];
let worker;
let bundleDirectory;
let session;
let providerSession;
const providerIP = "203.0.113.31";
let rateLimits;

function youtubeSearchFixture(query, music) {
    const artist = { text: "Artist", navigationEndpoint: { browseEndpoint: { browseId: "UCfixture" } } };
    if (music) {
        const flexColumn = runs => ({ musicResponsiveListItemFlexColumnRenderer: { text: { runs } } });
        const title = {
            text: "Music fallback",
            navigationEndpoint: { watchEndpoint: {
                videoId: youtubeId,
                watchEndpointMusicSupportedConfigs: { watchEndpointMusicConfig: { musicVideoType: "MUSIC_VIDEO_TYPE_ATV" } },
            } },
        };
        const song = { musicResponsiveListItemRenderer: {
            playlistItemData: { videoId: youtubeId },
            flexColumns: [flexColumn([title]), flexColumn([artist, { text: " · " }, { text: "0:10" }])],
        } };
        const contents = query === "Artist Music fallback" ? [song] : [];
        return { contents: { tabbedSearchResultsRenderer: { tabs: [{ tabRenderer: {
            selected: true,
            content: { sectionListRenderer: { contents: [{ musicShelfRenderer: { contents } }] } },
        } }] } } };
    }

    const video = { videoRenderer: {
        videoId: youtubeId,
        title: { simpleText: "Video fallback (Official Audio)" },
        ownerText: { runs: [{ ...artist, text: "Artist - Topic" }] },
        lengthText: { simpleText: "0:10" },
    } };
    const contents = query === "Artist Video fallback" ? [video] : [];
    return { contents: { sectionListRenderer: { contents: [{ itemSectionRenderer: { contents } }] } } };
}

function streamableMetadata(url) {
    return Response.json({
        title: "Test media",
        files: { mp4: { url, width: 1280, height: 720 } },
    });
}

async function mockUpstream(request) {
    const url = new URL(request.url);
    requests.push(url.href);

    switch (url.hostname) {
        case "challenges.cloudflare.com": {
            assert.equal(request.method, "POST");
            assert.equal(url.pathname, "/turnstile/v0/siteverify");
            const body = await request.json();
            assert.equal(body.secret, settings.TURNSTILE_SECRET);
            return Response.json({
                success: body.response !== "invalid",
                hostname: body.response === "wrong-host" ? "other.example" : "web.example.test",
            });
        }
        case "api.streamable.com":
            switch (url.pathname) {
                case "/videos/demo":
                    return streamableMetadata(media);
                case "/videos/unsafe":
                    return streamableMetadata("https://cdn.streamable.com.evil.example/media.mp4");
                case "/videos/hop":
                    return streamableMetadata("https://cdn.streamable.com/redirect.mp4");
                case "/videos/trap":
                    return streamableMetadata("https://cdn.streamable.com/escape.mp4");
            }
            break;
        case "www.newgrounds.com":
            if (url.pathname === "/portal/video/123") {
                assert.equal(request.headers.get("x-requested-with"), "XMLHttpRequest");
                return Response.json({
                    title: "Newgrounds fixture",
                    author: "Fixture artist",
                    sources: { "720p": [{ type: "video/mp4", src: "https://uploads.ngfiles.com/video.mp4" }] },
                });
            }
            if (url.pathname === "/audio/listen/123") {
                return new Response(JSON.stringify({
                    dummy: true,
                    params: {
                        name: "Fixture%20audio",
                        artist: "Fixture%20artist",
                        filename: "https://audio.ngfiles.com/test.mp3",
                        icon: "https://uploads.ngfiles.com/cover.png?1",
                        images: {},
                    },
                }));
            }
            break;
        case "public.api.bsky.app": {
            const post = url.searchParams.get("uri");
            const embed = post.endsWith("/video")
                ? { $type: "app.bsky.embed.video#view", playlist: "https://video.bsky.app/watch/example/master.m3u8" }
                : { $type: "app.bsky.embed.images#view", images: [{ fullsize: image }, { fullsize: image + "2" }] };
            return Response.json({ thread: { post: { embed } } });
        }
        case "cdn.bsky.app":
            return new Response("image", { headers: { "Content-Type": "image/jpeg" } });
        case "open.spotify.com": {
            const id = url.pathname.split("/").at(-1);
            assert.equal(url.pathname, "/embed/track/" + id);
            const name = ({
                [spotifyAmbiguousId]: "Same Name",
                [spotifyMusicFallbackId]: "Music fallback",
                [spotifyVideoFallbackId]: "Video fallback",
            })[id] ?? "Track";
            const entity = {
                id, type: "track", name,
                artists: [{ name: "Artist" }], duration: name.endsWith("fallback") ? 10000 : 20000,
            };
            const json = JSON.stringify({ props: { pageProps: { state: { data: { entity } } } } });
            return new Response('<script id="__NEXT_DATA__" type="application/json">' + json + '</script>');
        }
        case "soundcloud.com":
            return new Response('<script>window.__sc_version="1234567890"</script>{"hydratable":"apiClient","data":{"id":"fixture"}}');
        case "api-v2.soundcloud.com":
            if (url.pathname === "/search/tracks") {
                const title = url.searchParams.get("q").slice("Artist ".length);
                if (title.endsWith("fallback")) return Response.json({ collection: [] });
                const candidate = { id: 1, title, duration: 20000, user: { username: "Artist", verified: true }, permalink_url: soundCloudLink };
                const other = { ...candidate, id: 2, permalink_url: "https://soundcloud.com/artist/another" };
                return Response.json({ collection: [
                    { ...other, title: title === "Track" ? "Track (Live)" : title },
                    candidate,
                ] });
            }
            if (url.pathname === "/resolve") {
                assert.equal(url.searchParams.get("url"), soundCloudLink);
                return Response.json({
                    id: 1,
                    title: "Track",
                    user: { username: "Artist" },
                    track_authorization: "fixture",
                    media: { transcodings: [{
                        preset: "aac_160k",
                        format: { protocol: "hls", mime_type: "audio/mp4" },
                        url: url.origin + "/media/track",
                    }] },
                });
            }
            assert.equal(url.searchParams.get("track_authorization"), "fixture");
            return Response.json({ url: soundCloudMedia + "/track.m3u8" });
        case "playback.media-streaming.soundcloud.cloud":
            if (url.pathname.endsWith(".m3u8")) {
                const key = url.pathname === "/encrypted.m3u8" ? '#EXT-X-KEY:METHOD=AES-128,URI="key"\n' : "";
                return new Response(
                    '#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-TARGETDURATION:10\n' + key
                    + '#EXT-X-MAP:URI="initial.mp4"\n#EXTINF:10,\na.m4s\n#EXTINF:10,\nb.m4s\n#EXT-X-ENDLIST\n',
                );
            }
            return new Response(url.pathname);
        case "www.youtube.com":
        case "music.youtube.com":
        case "youtubei.googleapis.com": {
            assert.equal(request.method, "POST");
            const body = await request.json();
            if (url.pathname.endsWith("/search")) {
                return Response.json(youtubeSearchFixture(body.query, body.context.client.clientName === "WEB_REMIX"));
            }
            assert.ok(url.pathname.endsWith("/player"));
            if (body.videoId === youtubeFallbackId || body.videoId === youtubeCombinedOnlyId) {
                const android = body.context.client.clientName === "ANDROID";
                const combinedOnly = body.videoId === youtubeCombinedOnlyId;
                const muxed = android && !combinedOnly && ++fallbackAndroidRequests === 1 ? "preview?clen=8" : "redirect?clen=6";
                return Response.json({
                    playabilityStatus: { status: combinedOnly && !android ? "UNPLAYABLE" : "OK" },
                    videoDetails: { videoId: body.videoId, title: "Fallback", author: "Test artist", lengthSeconds: "12" },
                    streamingData: {
                        adaptiveFormats: android ? [] : [{
                            itag: 140, url: "https://video.googlevideo.com/preview?clen=8",
                            mimeType: 'audio/mp4; codecs="mp4a.40.2"', bitrate: 128000,
                            contentLength: "8", audioQuality: "AUDIO_QUALITY_MEDIUM",
                        }],
                        formats: android ? [{
                            itag: 18, url: `https://video.googlevideo.com/${muxed}`,
                            mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"', bitrate: 400000,
                            width: 640, height: 360, qualityLabel: "360p",
                            audioQuality: "AUDIO_QUALITY_MEDIUM",
                        }] : [],
                    },
                });
            }
            const formats = [
                { itag: 137, url: "https://video.googlevideo.com/video", mimeType: 'video/mp4; codecs="avc1.640028"',
                    height: 1080, width: 1920, bitrate: 2000000, contentLength: "6", qualityLabel: "1080p" },
                { itag: 136, url: "https://video.googlevideo.com/video720", mimeType: 'video/mp4; codecs="avc1.64001f"',
                    height: 720, width: 1280, bitrate: 1000000, contentLength: "9", qualityLabel: "720p" },
                { itag: 141, url: "https://video.googlevideo.com/unavailable", mimeType: 'audio/mp4; codecs="mp4a.40.2"',
                    audioChannels: 2, bitrate: 256000, contentLength: "20000", audioQuality: "AUDIO_QUALITY_HIGH" },
                { itag: 140, url: "https://video.googlevideo.com/audio", mimeType: 'audio/mp4; codecs="mp4a.40.2"',
                    audioChannels: 2, bitrate: 128000, contentLength: "6", audioQuality: "AUDIO_QUALITY_MEDIUM" },
            ];
            return Response.json({
                playabilityStatus: { status: body.videoId === youtubeId ? "OK" : "LOGIN_REQUIRED" },
                videoDetails: { videoId: body.videoId, title: "Public sample", author: "Test author", lengthSeconds: "10" },
                streamingData: { adaptiveFormats: formats, formats: [] },
            });
        }
        case "video.googlevideo.com": {
            if (url.pathname === "/unavailable") return new Response(null, { status: 403 });
            if (url.pathname === "/redirect") return Response.redirect("https://video.googlevideo.com/muxed");
            const requested = request.headers.get("Range");
            if (url.pathname === "/preview" && requested !== "bytes=0-0") return new Response(null, { status: 403 });
            if (url.pathname === "/muxed" && !requested) return new Response(null, { status: 403 });

            const content = url.pathname;
            const mime = url.pathname === "/audio" ? "audio/mp4" : "video/mp4";
            if (!requested) return new Response(content, { headers: { "Content-Type": mime } });
            const [, start, end] = /^bytes=(\d+)-(\d+)$/.exec(requested);
            const part = content.slice(+start, +end + 1);
            return new Response(part, {
                status: 206,
                headers: { "Content-Type": mime, "Content-Range": `bytes ${start}-${end}/${content.length}` },
            });
        }
        case "vt.tiktok.com":
            return Response.redirect(`https://www.tiktok.com/@author/photo/${tiktokGallery}`);
        case "www.tiktok.com": {
            const gallery = url.pathname.endsWith(tiktokGallery);
            const item = {
                author: { uniqueId: "author" },
                isContentClassified: url.pathname.endsWith("7415757181145877793"),
                video: { playAddr: gallery ? "" : "https://cdn.tiktokcdn.com/video.mp4" },
                imagePost: gallery ? { images: [{ imageURL: { urlList: ["https://cdn.tiktokcdn.com/photo.jpeg"] } }] } : undefined,
                music: { playUrl: gallery ? "https://cdn.tiktokcdn.com/audio?mime_type=audio_mpeg" : "" },
            };
            const data = { "__DEFAULT_SCOPE__": { "webapp.video-detail": { itemInfo: { itemStruct: item } } } };
            return new Response('<script type="application/json" id="__UNIVERSAL_DATA_FOR_REHYDRATION__">'
                + JSON.stringify(data) + "</script>");
        }
        case "cdn.tiktokcdn.com":
            assert.equal(request.headers.get("Referer"), "https://www.tiktok.com/");
            return new Response(url.pathname);
        case "cdn.streamable.com":
            if (url.pathname === "/redirect.mp4") {
                return Response.redirect(media);
            }
            if (url.pathname === "/escape.mp4") {
                return Response.redirect("https://cdn.streamable.com.evil.example/media.mp4");
            }
            if (url.pathname === "/media.mp4") {
                const range = request.headers.get("range");
                if (range === "bytes=1-3") {
                    return new Response("edi", {
                        status: 206,
                        headers: {
                            "Accept-Ranges": "bytes",
                            "Content-Range": "bytes 1-3/5",
                            "Content-Type": "video/mp4",
                        },
                    });
                }
                if (range === "bytes=10-") {
                    return new Response(null, {
                        status: 416, headers: { "Content-Range": "bytes */5" },
                    });
                }
                return new Response("media", { headers: { "Content-Type": "video/mp4" } });
            }
            break;
        case "uploads.ngfiles.com":
            return new Response("newgrounds", { headers: { "Content-Type": "video/mp4" } });
    }

    throw new Error("Unexpected upstream request: " + url);
}

before(async () => {
    bundleDirectory = await mkdtemp(join(tmpdir(), "cobalt-to-workers-test-"));
    const repo = fileURLToPath(new URL("../../../", import.meta.url));
    const config = join(repo, "api", "wrangler.jsonc");
    execFileSync(process.execPath, [
        "node_modules/wrangler/bin/wrangler.js",
        "deploy", "--dry-run", "--config", config, "--outdir", bundleDirectory,
    ], { cwd: repo, env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
    const script = (await readdir(bundleDirectory)).find(name => name.endsWith(".js"));
    assert.ok(script, "Wrangler produced a Worker bundle");

    const { workerOptions: { compatibilityDate, compatibilityFlags, ratelimits } } = unstable_getMiniflareWorkerOptions(config);
    rateLimits = ratelimits;
    const workerOptions = {
        modules: [{
            type: "ESModule",
            path: script,
            contents: await readFile(join(bundleDirectory, script), "utf8"),
        }],
        compatibilityDate,
        compatibilityFlags,
        ratelimits,
        outboundService: mockUpstream,
    };
    worker = new Miniflare(convertV4MiniflareOptions({
        workers: [
            { ...workerOptions, name: "api", bindings: settings },
            { ...workerOptions, name: "second-api", bindings: { ...settings, DISABLED_SERVICES: "bsky" } },
        ],
    }));
    const response = await turnstile("valid");
    assert.equal(response.status, 200, await response.clone().text());
    const info = await response.json();
    assert.equal(typeof info.token, "string");
    assert.ok(info.exp > 0 && info.exp <= 120);
    session = info.token;
    providerSession = (await (await turnstile("valid", providerIP)).json()).token;
});

after(async () => {
    await worker?.dispose();
    if (bundleDirectory) await rm(bundleDirectory, { recursive: true, force: true });
});

function send(path, options = {}, ip = clientIP) {
    return worker.dispatchFetch(new URL(path, api), {
        ...options,
        headers: { "CF-Connecting-IP": ip, Origin: frontend, ...options.headers },
    });
}

function turnstile(challenge, ip) {
    return send("/session", {
        method: "POST",
        headers: challenge ? { "CF-Turnstile-Response": challenge } : {},
    }, ip);
}

function download(body, token = session, ip = clientIP) {
    return send("/", {
        method: "POST",
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        body: JSON.stringify(body),
    }, ip);
}

async function checkError(response, code) {
    assert.ok(response.status >= 400, await response.clone().text());
    assert.equal((await response.json()).error.code, code);
}

test("advertises browser conversion, configured services, and frontend CORS", async () => {
    const response = await send("/");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), frontend);
    const { cobalt } = await response.json();
    assert.deepEqual(new Set(cobalt.services), new Set(["streamable", "newgrounds", "bluesky", "instagram", "loom", "pinterest", "soundcloud", "spotify", "youtube", "tiktok", "twitter"]));
    assert.equal(cobalt.localProcessingRequired, true);
    assert.equal(cobalt.turnstileSitekey, settings.TURNSTILE_SITEKEY);

    const preflight = await send("/session", {
        method: "OPTIONS",
        headers: {
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "cf-turnstile-response",
        },
    });
    assert.ok(preflight.ok);
    assert.equal(preflight.headers.get("access-control-allow-origin"), frontend);
    assert.match(preflight.headers.get("access-control-allow-headers"), /cf-turnstile-response/i);

    const otherOrigin = await send("/", { headers: { Origin: "https://other.example" } });
    assert.equal(otherOrigin.headers.get("access-control-allow-origin"), null);
});

test("rejects failed Turnstile checks and sessions from another client", async () => {
    await checkError(await turnstile(), "error.api.auth.turnstile.missing");
    await checkError(await turnstile("invalid"), "error.api.auth.turnstile.invalid");
    await checkError(await turnstile("wrong-host"), "error.api.auth.turnstile.invalid");
    await checkError(await download({ url: streamableLink }, "invalid"), "error.api.auth.jwt.invalid");
    await checkError(await download({ url: streamableLink }, session, "203.0.113.20"), "error.api.auth.jwt.invalid");
});

test("requires verification for video downloads and accepts audio and photo requests without a session", async () => {
    const ip = "203.0.113.42";
    await checkError(await download({ url: streamableLink }, null, ip), "error.api.auth.jwt.missing");
    await checkError(await download({ url: streamableLink, downloadMode: "mute" }, null, ip), "error.api.auth.jwt.missing");

    const audio = await (await download({ url: streamableLink, downloadMode: "audio" }, null, ip)).json();
    assert.equal(audio.status, "local-processing");
    assert.equal(audio.type, "audio");

    const soundcloud = await (await download({ url: soundCloudLink }, null, ip)).json();
    assert.equal(soundcloud.status, "local-processing");
    assert.equal(soundcloud.type, "audio");

    const photos = await (await download({ url: blueskyLink }, null, ip)).json();
    assert.equal(photos.status, "picker");
    assert.equal(photos.picker.length, 2);
});

test("resolves direct downloads and sends audio conversion to the browser", async () => {
    const direct = await download({ url: streamableLink });
    assert.equal(direct.status, 200);
    assert.deepEqual(await direct.json(), {
        status: "redirect", url: media, filename: "streamable_demo_1280x720.mp4",
    });

    const converted = await download({ url: streamableLink, downloadMode: "audio", localProcessing: "disabled" });
    const file = await converted.json();
    assert.equal(file.status, "local-processing");
    assert.equal(file.type, "audio");
    assert.equal(file.output.filename, "streamable_demo_audio.mp3");
    assert.equal(file.output.type, "audio/mpeg");
    assert.equal(file.audio.format, "mp3");
    assert.equal(file.tunnel.length, 1);
    const input = await send(file.tunnel[0]);
    assert.equal(await input.text(), "media");
});

test("rejects invalid request bodies before contacting a service", async () => {
    const requestCount = requests.length;
    await checkError(await download([]), "error.api.invalid_body");
    await checkError(await download({ url: streamableLink, extra: "x".repeat(1100) }), "error.api.invalid_body");
    await checkError(await download({}), "error.api.link.missing");
    assert.equal(requests.length, requestCount);
});

test("streams the Newgrounds video and resolves original audio", async () => {
    const video = await (await download({ url: newgroundsLink })).json();
    assert.equal(video.status, "tunnel");
    const file = await send(video.url);
    assert.equal(file.status, 200);
    assert.equal(await file.text(), "newgrounds");

    const audio = await (await download({
        url: "https://www.newgrounds.com/audio/listen/123",
        audioFormat: "best",
    })).json();
    assert.equal(audio.status, "tunnel");
    assert.match(audio.filename, /\.mp3$/);
});

test("returns Bluesky picker images and reports unsupported video and services", async () => {
    const gallery = await (await download({ url: blueskyLink })).json();
    assert.equal(gallery.status, "picker");
    assert.equal(gallery.picker.length, 2);
    assert.equal(gallery.picker[0].url, image);
    assert.equal(await (await send(gallery.picker[0].thumb)).text(), "image");

    await checkError(await download({ url: blueskyLink.replace("gallery", "video") }),
        "error.api.service.workers_hls_unavailable");
    await checkError(await download({ url: "https://www.vimeo.com/12345" }),
        "error.api.service.disabled");
});

test("streams SoundCloud's unencrypted AAC fragments in order for local processing", async () => {
    const response = await download({ url: soundCloudLink, audioFormat: "best" }, providerSession, providerIP);
    const track = await response.json();
    assert.equal(track.status, "local-processing", JSON.stringify(track));
    assert.equal(track.audio.format, "m4a");
    assert.equal(track.audio.copy, true);
    const audio = await send(track.tunnel[0]);
    assert.equal(audio.status, 200);
    assert.equal(audio.headers.get("Content-Type"), "audio/mp4");
    assert.equal(await audio.text(), "/initial.mp4/a.m4s/b.m4s");

    const encrypted = await createTunnel({
        url: soundCloudMedia + "/encrypted.m3u8",
        service: "soundcloud",
        hlsAudio: true,
    }, settings, api);
    assert.equal((await send(encrypted)).status, 502);
});

test("matches single Spotify tracks to SoundCloud and rejects ambiguous recordings", async () => {
    const url = "https://open.spotify.com/intl-en/track/" + spotifyId + "?si=share";
    const response = await download({ url, audioFormat: "best" }, null, providerIP);
    const track = await response.json();
    assert.equal(track.status, "local-processing", JSON.stringify(track));
    assert.equal(track.service, "soundcloud");
    assert.equal(track.output.metadata.artist, "Artist");
    assert.equal(track.audio.format, "m4a");
    assert.equal(track.audio.copy, true);
    assert.equal(await (await send(track.tunnel[0])).text(), "/initial.mp4/a.m4s/b.m4s");

    await checkError(await download({ url: "https://open.spotify.com/track/" + spotifyAmbiguousId }, null, providerIP),
        "error.api.spotify.no_match");
    await checkError(await download({ url: "https://open.spotify.com/playlist/" + spotifyId }, null, providerIP),
        "error.api.link.unsupported");
});

test("falls back from Spotify to YouTube Music and YouTube without requiring video verification", async () => {
    for (const id of [spotifyMusicFallbackId, spotifyVideoFallbackId]) {
        const response = await download({ url: "https://open.spotify.com/track/" + id }, null, providerIP);
        const track = await response.json();
        assert.equal(track.status, "local-processing", JSON.stringify(track));
        assert.equal(track.service, "youtube");
        assert.equal(track.audio.format, "mp3");
        assert.equal(await (await send(track.tunnel[0])).text(), "/audio");
    }
});

test("selects direct YouTube tracks for merge and for audio, and rejects login-required videos", async () => {
    const url = "https://youtu.be/" + youtubeId;
    const merged = await (await download({ url, videoQuality: "720" }, providerSession, providerIP)).json();
    assert.equal(merged.status, "local-processing", JSON.stringify(merged));
    assert.equal(merged.type, "merge");
    assert.equal(merged.output.type, "video/mp4");
    assert.deepEqual(await Promise.all(merged.tunnel.map(async link => (await send(link)).text())), ["/video720", "/audio"]);
    await checkError(await download({ url, youtubeVideoContainer: "webm" }, providerSession, providerIP),
        "error.api.youtube.no_matching_format");

    const audio = await (await download({ url, downloadMode: "audio", audioFormat: "best" }, providerSession, providerIP)).json();
    assert.equal(audio.status, "tunnel", JSON.stringify(audio));
    assert.match(audio.filename, /\.m4a$/);
    assert.equal(await (await send(audio.url)).text(), "/audio");

    await checkError(await download({ url: "https://youtu.be/dQw4w9WgXcQ" }, providerSession, providerIP),
        "error.api.content.video.unavailable");
});

test("uses a complete combined YouTube file when separate tracks are unavailable", async () => {
    const url = "https://youtu.be/" + youtubeFallbackId;
    const response = await download({
        url,
        downloadMode: "audio",
        audioFormat: "mp3",
    }, null, providerIP);
    const audio = await response.json();
    assert.equal(audio.status, "local-processing", JSON.stringify(audio));
    assert.equal(audio.audio.format, "mp3");
    assert.equal(audio.audio.copy, false);
    assert.equal(fallbackAndroidRequests, 2);

    const stream = await send(audio.tunnel[0]);
    assert.equal(stream.status, 200);
    assert.equal(stream.headers.get("Content-Range"), null);
    assert.equal(await stream.text(), "/muxed");

    const range = await send(audio.tunnel[0], { headers: { Range: "bytes=1-3" } });
    assert.equal(range.status, 206);
    assert.equal(range.headers.get("Content-Range"), "bytes 1-3/6");
    assert.equal(await range.text(), "mux");

    const videoURL = "https://youtu.be/" + youtubeCombinedOnlyId;
    await checkError(await download({ url: videoURL }, null, providerIP), "error.api.auth.jwt.missing");

    const video = await (await download({ url: videoURL }, providerSession, providerIP)).json();
    assert.equal(video.status, "tunnel", JSON.stringify(video));
    assert.equal(await (await send(video.url)).text(), "/muxed");

    const muted = await (await download({ url: videoURL, downloadMode: "mute" }, providerSession, providerIP)).json();
    assert.equal(muted.status, "local-processing", JSON.stringify(muted));
    assert.equal(muted.type, "mute");
    assert.equal(await (await send(muted.tunnel[0])).text(), "/muxed");
});

test("handles TikTok videos, short gallery links, and audio when the post exposes it", async () => {
    const video = await (await download({ url: `https://www.tiktok.com/@author/video/${tiktokVideo}` }, providerSession, providerIP)).json();
    assert.equal(video.status, "tunnel", JSON.stringify(video));
    assert.equal(await (await send(video.url)).text(), "/video.mp4");

    const galleryLink = "https://vt.tiktok.com/Shortlink/";
    const gallery = await (await download({ url: galleryLink }, providerSession, providerIP)).json();
    assert.equal(gallery.status, "picker", JSON.stringify(gallery));
    assert.equal(gallery.audioAvailable, true);
    assert.equal(await (await send(gallery.picker[0].url)).text(), "/photo.jpeg");

    const audio = await (await download({ url: galleryLink, downloadMode: "audio", audioFormat: "best" }, providerSession, providerIP)).json();
    assert.equal(audio.status, "tunnel", JSON.stringify(audio));
    assert.match(audio.filename, /\.mp3$/);
    await checkError(await download({ url: "https://www.tiktok.com/@author/video/7415757181145877793" }, providerSession, providerIP),
        "error.api.content.post.age");
});

test("validates tunnel probes before fetching and keeps byte ranges", async () => {
    const file = await (await download({ url: streamableLink, alwaysProxy: true })).json();
    assert.equal(file.status, "tunnel");
    const probe = new URL(file.url);
    probe.searchParams.set("p", "1");
    const requestCount = requests.length;
    assert.equal((await send(probe)).status, 200);
    assert.equal(requests.length, requestCount);

    const range = await send(file.url, { headers: { Range: "bytes=1-3" } });
    assert.equal(range.status, 206);
    assert.equal(range.headers.get("content-range"), "bytes 1-3/5");
    assert.equal(range.headers.get("accept-ranges"), "bytes");
    assert.match(range.headers.get("content-disposition"), /streamable_demo_1280x720\.mp4/);
    assert.equal(await range.text(), "edi");

    const unsatisfiable = await send(file.url, { headers: { Range: "bytes=10-" } });
    assert.equal(unsatisfiable.status, 416);
    assert.equal(unsatisfiable.headers.get("content-range"), "bytes */5");

    const token = probe.searchParams.get("token");
    probe.searchParams.set("token", (token[0] === "A" ? "B" : "A") + token.slice(1));
    assert.equal((await send(probe)).ok, false);
    assert.equal((await send("/tunnel?p=1")).ok, false);
    assert.equal(requests.length, requestCount + 2);
});

test("redeems a tunnel in another Worker isolate", async () => {
    const primary = await (await download({ url: streamableLink, alwaysProxy: true })).json();
    assert.equal(primary.status, "tunnel");
    const second = await worker.getWorker("second-api");
    const response = await second.fetch(primary.url, { headers: { "CF-Connecting-IP": clientIP } });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "media");

    const { cobalt } = await (await second.fetch(api)).json();
    assert.deepEqual(new Set(cobalt.services), new Set(["streamable", "newgrounds", "instagram", "loom", "pinterest", "soundcloud", "spotify", "youtube", "tiktok", "twitter"]));
});

test("rejects an expired tunnel with a valid signature", async ({ mock }) => {
    mock.timers.enable({ apis: ["Date"], now: Date.now() - 6 * 60_000 });
    let expired;
    try {
        expired = await createTunnel({ service: "streamable", url: media, filename: "expired.mp4" }, settings, api);
    } finally {
        mock.timers.reset();
    }
    assert.ok(expired);
    const requestCount = requests.length;
    assert.equal((await send(expired)).ok, false);
    assert.equal(requests.length, requestCount);
});

test("checks the original target and every upstream redirect", async () => {
    const disallowed = await download({ url: "https://streamable.com/unsafe" });
    assert.equal(disallowed.ok, false);

    const allowed = await (await download({ url: "https://streamable.com/hop", alwaysProxy: true })).json();
    assert.equal(await (await send(allowed.url)).text(), "media");

    const trap = await (await download({ url: "https://streamable.com/trap", alwaysProxy: true })).json();
    assert.equal((await send(trap.url)).ok, false);
    assert.equal(requests.some(url => new URL(url).hostname === "cdn.streamable.com.evil.example"), false);
});

test("rate-limits sessions separately from resolution", async () => {
    const testIP = "203.0.113.30";
    const valid = await turnstile("valid", testIP);
    assert.equal(valid.status, 200);
    const { token } = await valid.json();
    for (let count = 1; count < rateLimits.SESSION_LIMITER.simple.limit; count++) {
        await checkError(await turnstile("invalid", testIP), "error.api.auth.turnstile.invalid");
    }
    const limited = await turnstile("valid", testIP);
    assert.equal(limited.status, 429);
    assert.equal((await download({ url: streamableLink }, token, testIP)).status, 200);
});
