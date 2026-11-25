import { isMediaURLAllowed } from "./tunnel.js";

const clipQuery = `
    query Clip($slug: ID!) {
        clip(slug: $slug) {
            id
            title
            broadcaster { login }
            durationSeconds
            videoQualities { quality sourceURL }
            playbackAccessToken(params: {platform: "web", playerType: "embed", playerBackend: "mediaplayer"}) {
                signature
                value
            }
        }
    }
`;

export default async function twitch({ clip: slug, quality, fetcher, durationLimit }) {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(slug ?? "")) return { error: "link.unsupported" };

    const response = await fetcher("https://gql.twitch.tv/gql", {
        method: "POST",
        headers: {
            "Client-ID": "kimne78kx3ncx6brgo4mv6wki5h1ko",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: clipQuery, variables: { slug } }),
    }).catch(() => undefined);
    if (!response?.ok) {
        await response?.body?.cancel();
        return { error: "fetch.fail" };
    }

    const data = await response.json().catch(() => undefined);
    const clip = data?.data?.clip;
    const access = clip?.playbackAccessToken;
    if (!clip?.id || !access?.signature || !access.value) return { error: "fetch.empty" };
    if (clip.durationSeconds > durationLimit) return { error: "content.too_long" };

    const formats = (clip.videoQualities ?? [])
        .filter(format => Number(format.quality) > 0 && isMediaURLAllowed("twitch", format.sourceURL)
            && new URL(format.sourceURL).pathname.endsWith(".mp4"))
        .sort((a, b) => Number(b.quality) - Number(a.quality));
    const format = quality === "max" ? formats[0]
        : formats.find(format => Number(format.quality) <= Number(quality)) ?? formats.at(-1);
    if (!format) return { error: "fetch.empty" };

    const source = new URL(format.sourceURL);
    source.searchParams.set("sig", access.signature);
    source.searchParams.set("token", access.value);

    const title = clip.title?.trim() || slug;
    const author = clip.broadcaster?.login;
    return {
        urls: source.href,
        filenameAttributes: {
            service: "twitch",
            id: clip.id,
            title,
            author,
            qualityLabel: format.quality + "p",
            extension: "mp4",
        },
        fileMetadata: { title, artist: author },
    };
}
