# cobalt api

the [workers api](worker/) resolves links, checks turnstile, and streams files. the frontend handles media conversion in the browser. see [how to run it on cloudflare workers](../docs/run-on-workers.md) and [how to call the api](../docs/api.md#using-the-api-on-workers).

the standalone setup below covers the upstream [express.js](https://www.npmjs.com/package/express) api. the service table covers the workers port.

## running your own instance
if you want to run your own instance for whatever purpose, [follow this guide](/docs/run-an-instance.md).
we recommend to use docker compose unless you intend to run cobalt for developing/debugging purposes.

## accessing the api
there is currently no publicly available pre-hosted api.
we recommend [deploying your own instance](/docs/run-an-instance.md) if you wish to use the cobalt api.

you can read [the api documentation here](/docs/api.md).

## supported services

these services are enabled by default in this checkout. check `GET /` for the services enabled on a running worker. formats depend on what the provider returns for each public link.

| service | video + audio | only audio | only video | photos / gifs | metadata | rich file names |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| bluesky | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| instagram | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| loom | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| pinterest | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| reddit | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| snapchat | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| soundcloud | ➖ | ✅ | ➖ | ➖ | ✅ | ✅ |
| spotify | ➖ | ✅ | ➖ | ➖ | ✅ | ✅ |
| streamable | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| tiktok | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| tumblr | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| twitch clips | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| twitter/x | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| youtube | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |

| symbol | meaning |
| :---: | --- |
| ✅ | supported when the media is available |
| ➖ | doesn't apply to this adapter |
| ❌ | unavailable on workers |

metadata means tags such as title or artist that the browser can add during processing. rich file names can use titles or authors when the adapter has them.

### notes by service

- **bluesky** saves photos, image galleries, and supported tenor gifs. video still needs hls support.
- **instagram and twitter/x** can open a picker for posts with multiple items. audio extraction and muting apply to single videos.
- **pinterest** supports image, gif, and direct mp4 pins, including short links.
- **reddit** supports reddit-hosted mp4 tracks and `v.redd.it` links. audio export needs a separate audio track.
- **snapchat** supports public spotlight videos and short links that lead to spotlight.
- **spotify** matches single tracks to soundcloud, then youtube music, then youtube.
- **tiktok** supports photo posts. video and audio depend on the media urls tiktok returns.
- **tumblr** adds tags and rich file names for native audio. best mode can save the original mp3.
- **youtube** uses direct tracks or a combined mp4 when available.

newgrounds has a worker adapter and ships disabled after staging requests failed. see the [workers guide](../docs/run-on-workers.md#what-you-can-download) for more details.

## license
cobalt api code is licensed under [AGPL-3.0](LICENSE).

this license allows you to modify, distribute and use the code for any purpose
as long as you:
- give appropriate credit to the original repo when using or modifying any parts of the code,
- provide a link to the license and indicate if changes to the code were made, and
- release the code under the **same license**

## open source acknowledgements
### ffmpeg
cobalt relies on ffmpeg for muxing and encoding media files. ffmpeg is absolutely spectacular and we're privileged to have the ability to use it for free, just like anyone else. we believe it should be way more recognized.

you can [support ffmpeg here](https://ffmpeg.org/donations.html)!

### youtube.js
cobalt relies on **[youtube.js](https://github.com/LuanRT/YouTube.js)** for interacting with youtube's innertube api, it wouldn't have been possible without this package.

you can support the developer via various methods listed on their github page!
(linked above)

### many others
cobalt-api also depends on:

- **[content-disposition-header](https://www.npmjs.com/package/content-disposition-header)** to simplify the provision of `content-disposition` headers.
- **[cors](https://www.npmjs.com/package/cors)** to manage cross-origin resource sharing within expressjs.
- **[dotenv](https://www.npmjs.com/package/dotenv)** to load environment variables from the `.env` file.
- **[express](https://www.npmjs.com/package/express)** as the backbone of cobalt servers.
- **[express-rate-limit](https://www.npmjs.com/package/express-rate-limit)** to rate limit api endpoints.
- **[ffmpeg-static](https://www.npmjs.com/package/ffmpeg-static)** to get binaries for ffmpeg depending on the platform.
- **[hls-parser](https://www.npmjs.com/package/hls-parser)** to parse HLS playlists according to spec (very impressive stuff).
- **[ipaddr.js](https://www.npmjs.com/package/ipaddr.js)** to parse ip addresses (used for rate limiting).
- **[nanoid](https://www.npmjs.com/package/nanoid)** to generate unique identifiers for each requested tunnel.
- **[set-cookie-parser](https://www.npmjs.com/package/set-cookie-parser)** to parse cookies that cobalt receives from certain services.
- **[undici](https://www.npmjs.com/package/undici)** for making http requests.
- **[url-pattern](https://www.npmjs.com/package/url-pattern)** to match provided links with supported patterns.
- **[zod](https://www.npmjs.com/package/zod)** to lock down the api request schema.
- **[@datastructures-js/priority-queue](https://www.npmjs.com/package/@datastructures-js/priority-queue)** for sorting stream caches for future clean up (without redis).
- **[@imput/psl](https://www.npmjs.com/package/@imput/psl)** as the domain name parser, our fork of [psl](https://www.npmjs.com/package/psl).

...and many other packages that these packages rely on.
