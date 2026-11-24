# Cobalt-To-Workers

Cobalt-To-Workers is a noncommercial Cobalt fork for Cloudflare Workers Free. One Worker serves the SvelteKit site and a second resolves media links and streams downloads. The browser handles conversion with LibAV.

See [setup, service coverage, and deployment](docs/run-on-workers.md). The material below describes the upstream Cobalt project.

## Upstream Cobalt

cobalt is a media downloader that doesn't piss you off. it's friendly, efficient, and doesn't have ads, trackers, paywalls or other nonsense.

paste the link, get the file, move on. that simple, just how it should be.

### cobalt monorepo
this monorepo includes source code for api, frontend, and related packages:
- [api tree & readme](/api/)
- [web tree & readme](/web/)
- [packages tree](/packages/)

it also includes documentation in the [docs tree](/docs/):
- [how to run a cobalt instance](/docs/run-an-instance.md)
- [how to protect a cobalt instance](/docs/protect-an-instance.md)
- [cobalt api instance environment variables](/docs/api-env-variables.md)
- [cobalt api documentation](/docs/api.md)

### ethics
cobalt is a tool that makes downloading public content easier. it takes **zero liability**.
the end user is responsible for what they download, how they use and distribute that content.
cobalt never caches any content, it [works like a fancy proxy](/api/src/stream/).

cobalt is in no way a piracy tool and cannot be used as such.
it can only download free & publicly accessible content.
same content can be downloaded via dev tools of any modern web browser.

### contributing
if you're considering contributing to cobalt, first of all, thank you! check the [contribution guidelines here](/CONTRIBUTING.md) before getting started, they'll help you do your best right away.

### thank you
cobalt is sponsored by [royalehosting.net](https://royalehosting.net/?partner=cobalt). a part of our infrastructure is hosted on their network. we really appreciate their kindness and support!

### licenses
for relevant licensing information, see the [api](api/README.md) and [web](web/README.md) READMEs.
unless specified otherwise, the remainder of this repository is licensed under [AGPL-3.0](LICENSE).
