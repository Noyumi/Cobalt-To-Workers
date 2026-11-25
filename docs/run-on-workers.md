# run cobalt-to-workers on cloudflare

deploy the static frontend and the api as two workers on the free plan. use node.js 24 lts and the workspace's pinned pnpm version from the repository root.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm test:workers
```

the workers tests bundle the api with wrangler and run it under miniflare. they mock media providers and turnstile. the upstream node api uses native dependencies, so follow its own setup instructions if you also want to run that version.

## local development

create `api/.dev.vars` with the bindings below. this file is ignored by git. use `API_URL=http://localhost:8787` and `WEB_ORIGIN=http://localhost:8788` for a local run.

| binding | value |
| --- | --- |
| `API_URL` | the full origin of the api worker |
| `WEB_ORIGIN` | the full origin of the frontend, with no trailing slash |
| `TURNSTILE_SITEKEY` | a turnstile widget sitekey |
| `TURNSTILE_SECRET` | the corresponding widget secret |
| `JWT_SECRET` | a random secret of at least 32 characters |
| `TUNNEL_SECRET` | a random 32-byte key encoded as base64url |
| `DISABLED_SERVICES` | comma-separated adapter ids to disable. the wrangler default is `newgrounds`. use an empty value to test all implemented adapters locally. |
| `SOURCE_URL` | the fork repository url for server information |

generate each random secret separately with `node -p "require('node:crypto').randomBytes(32).toString('base64url')"`. for a browser test against real turnstile, use a development widget that allows your frontend hostname. turnstile's public test keys return `example.com` as the verified hostname. the api checks the hostname, and the offline tests mock the validation service.

build the frontend with `WEB_DEFAULT_API=http://localhost:8787` in your shell environment.

```sh
pnpm --filter @imput/cobalt-web check
pnpm --filter @imput/cobalt-web build
pnpm workers:api:dev
```

in a second terminal, run `pnpm workers:web:dev --port 8788` and open `http://localhost:8788`.

## deploy and verify

1. create separate api and site workers. the default worker names are `cobalt-to-workers-api` and `cobalt-to-workers`. to update the existing staging deployment, pass `--name worker-media-saver-api-staging` or `--name worker-media-saver-staging`. record the two https origins.
2. create a turnstile widget for the frontend hostname. set the api's public variables in the cloudflare dashboard or via `--var NAME:VALUE` flags. add `TURNSTILE_SECRET`, `JWT_SECRET`, and `TUNNEL_SECRET` as encrypted secrets. use different secrets per instance. the api wrangler file keeps dashboard variables across deploys. use account-unique rate-limit namespace ids for independent instances.
3. run `pnpm workers:api:deploy`. set `WEB_DEFAULT_API` to that api origin, `WEB_HOST` to the frontend hostname, and `WEB_SOURCE_URL` to the corresponding fork source. build the frontend, then run `pnpm workers:web:deploy`.
4. on staging, solve turnstile and save a direct file. check a streamed file, the bluesky image picker, and a playable audio file produced through the browser queue. check coop and coep headers, inspect the largest libav asset against the 25 mib asset cap, and check worker metrics for resource-limit errors. workers free has a 10 ms cpu limit per http request and a 50-subrequest limit. record live results before enabling an adapter in a public release.
5. for a bad release, use cloudflare's deployments view to roll back the affected worker. roll back both if an api and frontend change must ship together. changing either signing secret invalidates the corresponding outstanding tokens.

the session, download api, and tunnel each have a separate per-location rate limit. video downloads require a turnstile session. audio downloads and photo pickers use the download rate limit without a session. sessions expire after two minutes. tunnel links expire after five minutes and can be redeemed by any isolate carrying the same secret. keep the api url and tunnel urls out of public application logs when they include tokens.

## adapter coverage

| adapter | download support |
| --- | --- |
| streamable (`streamable`) | direct video, optional proxy, browser audio and mute |
| newgrounds (`newgrounds`) | streamed video and audio, browser conversion. disabled by default after live staging requests failed. |
| bluesky (`bsky`) | single images, image pickers, and supported tenor gifs |
| instagram (`instagram`) | public posts and reels when instagram's embed includes the media. supports photos, direct mp4s, and carousels. |
| loom (`loom`) | public share and embed links with direct mp4. the browser handles muting and can add captions when loom provides them. |
| pinterest (`pinterest`) | public image, gif, and direct mp4 pins, including short links. the browser handles audio extraction and muting. |
| reddit (`reddit`) | public reddit-hosted videos and `v.redd.it` links with direct mp4 tracks. the browser joins separate audio and video tracks or exports audio by itself. |
| snapchat (`snapchat`) | public spotlight videos and short links that open a spotlight post. the browser handles audio extraction and muting. |
| soundcloud (`soundcloud`) | public track and short links, original aac in m4a, browser audio conversion. fragmented aac streams support up to 46 media segments per download. |
| spotify (`spotify`) | public single-track links. reads spotify's public embed metadata and tries soundcloud, youtube music, then youtube. uses the audio pipeline for the source that matches. |
| youtube (`youtube`) | direct audio and video tracks on public videos. when separate tracks are unavailable, the worker can use a combined mp4 for video or for browser-side audio extraction. coverage depends on the formats youtube returns to the worker. |
| tiktok (`tiktok`) | photo posts and short links. video and audio require a media url in tiktok's public response. |
| tumblr (`tumblr`) | native audio and video from public posts. saves original mp3 audio in best mode. |
| twitch clips (`twitch`) | public clip links, mp4 quality selection, and browser audio export. |
| twitter / x (`twitter`) | photos, direct mp4s, and animated clips from public post embeds. mixed posts open a picker. |

live workers checks verified streamable byte ranges, bluesky gallery images, soundcloud audio streams, youtube audio and separate video tracks, and a ten-photo tiktok post. a second youtube sample returned no usable format, and tiktok omitted the video address for its test post. newgrounds passed the mocked tests but failed the live video and audio requests. keep it disabled until both live paths pass. bluesky hls video and the other cobalt services are later milestones.

the api uses cobalt's response shapes. api clients need to process `local-processing` responses themselves. the api and frontend keep their respective upstream licenses. provide the corresponding source for the deployed api and retain the frontend license and attribution when distributing the fork.

- [cloudflare workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [turnstile hostname and test behavior](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)
- [upstream frontend license and attribution](../web/LICENSE)
- [api license](../api/LICENSE)
