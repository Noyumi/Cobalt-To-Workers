import { env } from "../config.js";
import { extract as extractURL, getHostIfValid, normalizeURL } from "./link.js";
import { request } from "undici";
const redirectStatuses = new Set([301, 302, 303, 307, 308]);

async function getRedirectingURL(url, dispatcher, headers) {
    const params = {
        dispatcher,
        method: 'HEAD',
        headers,
        redirect: 'manual'
    };
    const getParams = {
        ...params,
        method: 'GET',
    };

    const callback = (r) => {
        if (redirectStatuses.has(r.statusCode) && r.headers['location']) {
            return r.headers['location'];
        }
    }

    /*
        try request() with HEAD & GET,
        then do the same with fetch
        (fetch is required for shortened reddit links)
    */

    let location = await request(url, params)
        .then(callback).catch(() => null);

    location ??= await request(url, getParams)
        .then(callback).catch(() => null);

    location ??= await fetch(url, params)
        .then(callback).catch(() => null);

    location ??= await fetch(url, getParams)
        .then(callback).catch(() => null);

    return location;
}

export { normalizeURL };

export function extract(url, enabledServices = env.enabledServices) {
    return extractURL(url, enabledServices, env.apiURL);
}

export async function resolveRedirectingURL(url, dispatcher, headers) {
    const originalService = getHostIfValid(normalizeURL(url));
    if (!originalService) return;

    const canonicalURL = await getRedirectingURL(url, dispatcher, headers);
    if (!canonicalURL) return;

    const { host, patternMatch } = extract(normalizeURL(canonicalURL));

    if (host === originalService) {
        return patternMatch;
    }
}
