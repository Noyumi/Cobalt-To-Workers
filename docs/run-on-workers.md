# Run Cobalt-To-Workers on Cloudflare

Deploy the static frontend and the API as two Workers on the Free plan. Use Node.js 24 LTS and the workspace's pinned pnpm version from the repository root.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm test:workers
```

The Workers tests bundle the API with Wrangler and run it under Miniflare. They mock media providers and Turnstile. The upstream Node API uses native dependencies, so follow its own setup instructions if you also want to run that version.

## Local development

Create `api/.dev.vars` with the bindings below. This file is ignored by Git. Use `API_URL=http://localhost:8787` and `WEB_ORIGIN=http://localhost:8788` for a local run.

| Binding | Value |
| --- | --- |
| `API_URL` | The full origin of the API Worker |
| `WEB_ORIGIN` | The full origin of the frontend, with no trailing slash |
| `TURNSTILE_SITEKEY` | A Turnstile widget sitekey |
| `TURNSTILE_SECRET` | The corresponding widget secret |
| `JWT_SECRET` | A random secret of at least 32 characters |
| `TUNNEL_SECRET` | A random 32-byte key encoded as base64url |
| `DISABLED_SERVICES` | Comma-separated adapter IDs to disable. The Wrangler default is `newgrounds`. Use an empty value to test all implemented adapters locally. |
| `SOURCE_URL` | The fork repository URL for server information |

Generate each random secret separately with `node -p "require('node:crypto').randomBytes(32).toString('base64url')"`. For a browser test against real Turnstile, use a development widget that allows your frontend hostname. Turnstile's public test keys return `example.com` as the verified hostname. The API checks the hostname, and the offline tests mock the validation service.

Build the frontend with `WEB_DEFAULT_API=http://localhost:8787` in your shell environment.

```sh
pnpm --filter @imput/cobalt-web check
pnpm --filter @imput/cobalt-web build
pnpm workers:api:dev
```

In a second terminal, run `pnpm workers:web:dev --port 8788` and open `http://localhost:8788`.

## Deploy and verify

1. Create separate API and site Workers. The default Worker names are `cobalt-to-workers-api` and `cobalt-to-workers`. To update the existing staging deployment, pass `--name worker-media-saver-api-staging` or `--name worker-media-saver-staging`. Record the two HTTPS origins.
2. Create a Turnstile widget for the frontend hostname. Set the API's public variables in the Cloudflare dashboard or via `--var NAME:VALUE` flags. Add `TURNSTILE_SECRET`, `JWT_SECRET`, and `TUNNEL_SECRET` as encrypted secrets. Use different secrets per instance. The API Wrangler file keeps dashboard variables across deploys. Use account-unique rate-limit namespace IDs for independent instances.
3. Run `pnpm workers:api:deploy`. Set `WEB_DEFAULT_API` to that API origin, `WEB_HOST` to the frontend hostname, and `WEB_SOURCE_URL` to the corresponding fork source. Build the frontend, then run `pnpm workers:web:deploy`.
4. On staging, solve Turnstile and save a direct file. Check a streamed file, the Bluesky image picker, and a playable audio file produced through the browser queue. Check COOP and COEP headers, inspect the largest LibAV asset against the 25 MiB asset cap, and check Worker metrics for resource-limit errors. Workers Free has a 10 ms CPU limit per HTTP request and a 50-subrequest limit. Record live results before enabling an adapter in a public release.
5. For a bad release, use Cloudflare's Deployments view to roll back the affected Worker. Roll back both if an API and frontend change must ship together. Changing either signing secret invalidates the corresponding outstanding tokens.

The session, download API, and tunnel each have a separate per-location rate limit. Video downloads require a Turnstile session. Audio downloads and photo pickers use the download rate limit without a session. Sessions expire after two minutes. Tunnel links expire after five minutes and can be redeemed by any isolate carrying the same secret. Keep the API URL and tunnel URLs out of public application logs when they include tokens.

## Adapter coverage

| Adapter | Download support |
| --- | --- |
| Streamable (`streamable`) | Direct video, optional proxy, browser audio and mute |
| Newgrounds (`newgrounds`) | Streamed video and audio, browser conversion. Disabled by default after live staging requests failed. |
| Bluesky (`bsky`) | Single images, image pickers, and supported Tenor GIFs |
| SoundCloud (`soundcloud`) | Public track and short links, original AAC in M4A, browser audio conversion. Fragmented AAC streams support up to 46 media segments per download. |
| YouTube (`youtube`) | Direct audio and video tracks on public videos. When separate tracks are unavailable, the Worker can use a combined MP4 for video or for browser-side audio extraction. Coverage depends on the formats YouTube returns to the Worker. |
| TikTok (`tiktok`) | Photo posts and short links. Video and audio require a media URL in TikTok's public response. |

Live Workers checks verified Streamable byte ranges, Bluesky gallery images, SoundCloud audio streams, YouTube audio and separate video tracks, and a ten-photo TikTok post. A second YouTube sample returned no usable format, and TikTok omitted the video address for its test post. Newgrounds passed the mocked tests but failed the live video and audio requests. Keep it disabled until both live paths pass. Bluesky HLS video and the other Cobalt services are later milestones.

The API uses Cobalt's response shapes. API clients need to process `local-processing` responses themselves. The API and frontend keep their respective upstream licenses. Provide the corresponding source for the deployed API and retain the frontend license and attribution when distributing the fork.

- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Turnstile hostname and test behavior](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)
- [Upstream frontend license and attribution](../web/LICENSE)
- [API license](../api/LICENSE)
