# run cobalt-to-workers on cloudflare

the site and the api run as two cloudflare workers on the free plan. the api resolves links and streams files. your browser does the merging and conversion.

## before you start

use node.js 24 lts and the pnpm version in `package.json`. from the repo root, install the dependencies and run the worker tests.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm test:workers
```

the tests run the api in miniflare and mock media providers and turnstile.

## local development

put your api bindings in `api/.dev.vars`. git ignores this file. for a local run, set `API_URL=http://localhost:8787` and `WEB_ORIGIN=http://localhost:8788`.

| binding | value |
| --- | --- |
| `API_URL` | the full origin of the api worker |
| `WEB_ORIGIN` | the full origin of the frontend, with no trailing slash |
| `TURNSTILE_SITEKEY` | a turnstile widget sitekey |
| `TURNSTILE_SECRET` | the corresponding widget secret |
| `JWT_SECRET` | a random secret of at least 32 characters |
| `TUNNEL_SECRET` | a random 32-byte key encoded as base64url |
| `DISABLED_SERVICES` | comma-separated adapter ids to disable. the wrangler default is `newgrounds`. use an empty value to test all implemented adapters locally. |
| `SOURCE_URL` | url of the source for this version of the api. the api exposes it in `GET /`. |

run this command once for `JWT_SECRET` and again for `TUNNEL_SECRET`.

```sh
node -p "require('node:crypto').randomBytes(32).toString('base64url')"
```

to test video downloads in a browser, use a turnstile widget that allows your frontend hostname. the api checks the verified hostname against `WEB_ORIGIN`. cloudflare's public test keys return `example.com`.

set `WEB_DEFAULT_API=http://localhost:8787` in your shell or in `web/.env.local` before you build the frontend.

```sh
pnpm --filter @imput/cobalt-web check
pnpm --filter @imput/cobalt-web build
pnpm workers:api:dev
```

in a second terminal, run `pnpm workers:web:dev --port 8788` and open `http://localhost:8788`.

## deploy your instance

1. run `pnpm exec wrangler login` and pick an https origin for each worker. the default worker names are `cobalt-to-workers-api` and `cobalt-to-workers`. if you use [custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/), set a custom domain route in each wrangler config.
2. create a turnstile widget for the frontend hostname. run `pnpm workers:api:deploy`, then set the api bindings from the table above in the cloudflare dashboard. add `TURNSTILE_SECRET`, `JWT_SECRET`, and `TUNNEL_SECRET` as encrypted secrets. for a staging instance, use its own secrets and rate-limit namespace ids.
3. set `WEB_DEFAULT_API` to the api origin and `WEB_HOST` to the frontend hostname. use the same source url for `WEB_SOURCE_URL` on the frontend and `SOURCE_URL` on the api. run `pnpm --filter @imput/cobalt-web build`, then `pnpm workers:web:deploy`.

## check a deployment

- save a video after solving turnstile. try a photo picker and play an audio file from the browser queue.
- check that the frontend sends the `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers. the browser uses them for local conversion.
- check the largest libav asset against the 25 mib asset limit. check the worker metrics for cpu and subrequest errors before enabling a provider in production.

if a release breaks downloads, use cloudflare's deployments view to roll back the affected worker. roll back both if the frontend and api changes depend on each other.

video downloads require a turnstile session. audio-only and photo-only downloads use the download api without a session. sessions last two minutes, and signed tunnel links last five minutes. changing either signing secret invalidates its outstanding tokens. keep tunnel urls out of public logs.

## what you can download

| adapter | download support |
| --- | --- |
| bluesky (`bsky`) | single images, image pickers, and supported tenor gifs |
| instagram (`instagram`) | public posts and reels when instagram's embed includes the media. supports photos, direct mp4s, and carousels. |
| loom (`loom`) | public share and embed links with direct mp4. the browser handles muting and can add captions when loom provides them. |
| newgrounds (`newgrounds`) | streamed video and audio. disabled by default after staging requests failed. |
| pinterest (`pinterest`) | public image, gif, and direct mp4 pins, including short links. the browser handles audio extraction and muting. |
| reddit (`reddit`) | public reddit-hosted videos and `v.redd.it` links with direct mp4 tracks. the browser joins separate audio and video tracks or exports audio by itself. |
| snapchat (`snapchat`) | public spotlight videos and short links that open a spotlight post. the browser handles audio extraction and muting. |
| soundcloud (`soundcloud`) | public track and short links, original aac in m4a, browser audio conversion. fragmented aac streams support up to 46 media segments per download. |
| spotify (`spotify`) | public single-track links. reads spotify's public embed metadata and tries soundcloud, youtube music, then youtube. uses the audio pipeline for the source that matches. |
| streamable (`streamable`) | direct video, optional proxy, browser audio and mute |
| tiktok (`tiktok`) | photo posts and short links. video and audio require a media url in tiktok's public response. |
| tumblr (`tumblr`) | native audio and video from public posts. saves original mp3 audio in best mode. |
| twitch clips (`twitch`) | public clip links, mp4 quality selection, and browser audio export. |
| twitter / x (`twitter`) | photos, direct mp4s, and animated clips from public post embeds. mixed posts open a picker. |
| youtube (`youtube`) | direct audio and video tracks on public videos. the worker can use a combined mp4 for video or audio extraction when separate tracks are unavailable. |

the table describes the code in this checkout. open the supported services menu on a running instance to see what it has enabled. a provider can return different formats for different posts. bluesky video still needs hls support.

## more info

- [using the api on workers](api.md#using-the-api-on-workers)
- [cloudflare workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [turnstile hostname and test behavior](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)
- [upstream frontend license and attribution](../web/LICENSE)
- [api license](../api/LICENSE)
