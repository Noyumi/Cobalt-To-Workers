import psl from "@imput/psl";

const API_KEY = 'jrsCWX1XDuVxAFO4GkK147syAoN8BJZ5voz8tS80bPcj26Vc5Z';
const API_BASE = 'https://api-http2.tumblr.com';

function request(domain, id, fetcher) {
    const url = new URL(`/v2/blog/${domain}/posts/${id}/permalink`, API_BASE);
    url.searchParams.set('api_key', API_KEY);
    url.searchParams.set('fields[blogs]', 'uuid,name,avatar,?description,?can_message,?can_be_followed,?is_adult,?reply_conditions,'
                                            + '?theme,?title,?url,?is_blocked_from_primary,?placement_id,?primary,?updated,?followed,'
                                            + '?ask,?can_subscribe,?paywall_access,?subscription_plan,?is_blogless_advertiser,?tumblrmart_accessories');

    return fetcher(url, {
        headers: {
            'User-Agent': 'Tumblr/iPhone/33.3/333010/17.3.1/tumblr',
            'X-Version': 'iPhone/33.3/333010/17.3.1/tumblr'
        }
    }).then(a => a.json()).catch(() => {});
}

export default async function({ url, user, id, fetcher = fetch }) {
    let { subdomain } = psl.parse(url.hostname);

    if (subdomain?.includes('.')) {
        return { error: "link.unsupported" };
    } else if (subdomain === 'www' || subdomain === 'at') {
        subdomain = undefined
    }

    const blog = subdomain ?? user;
    if (!/^[a-z0-9-]+$/i.test(blog ?? "") || !/^\d{1,20}$/.test(id ?? "")) {
        return { error: "link.unsupported" };
    }

    const data = await request(blog + '.tumblr.com', id, fetcher);

    const element = data?.response?.timeline?.elements?.[0];
    if (!element) return { error: "fetch.empty" };

    const contents = [
        ...(element.content ?? []),
        ...(element.trail ?? []).flatMap(post => post.content ?? []),
    ]

    const audio = contents.find(c => c.type === 'audio' && c.provider === 'tumblr' && c.media?.url);
    if (audio) {
        const title = audio.title?.trim() || 'tumblr_' + id;
        const artist = audio.artist?.trim();
        return {
            urls: audio.media.url,
            filenameAttributes: {
                service: 'tumblr',
                id,
                title,
                author: artist,
            },
            fileMetadata: { title, artist },
            isAudioOnly: true,
            bestAudio: "mp3",
        }
    }

    const video = contents.find(c => c.type === 'video' && c.provider === 'tumblr' && c.media?.url);
    if (video) {
        return {
            urls: video.media.url,
            filename: `tumblr_${id}.mp4`,
            audioFilename: `tumblr_${id}_audio`
        }
    }

    return { error: "link.unsupported" }
}
