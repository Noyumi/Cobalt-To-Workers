# contributing to cobalt-to-workers

thanks for helping with the port. start with the [workers setup guide](docs/run-on-workers.md) to run the site and api on your machine.

## where things live

- [api/worker](api/worker/) resolves links, verifies turnstile, and streams files on cloudflare workers.
- [api/src/processing](api/src/processing/) has the link patterns and response formats shared with the upstream api.
- [web](web/) has the sveltekit site. the [browser queue](web/src/lib/task-manager/) handles merging and conversion.

keep changes scoped to the code that needs them. if you change shared processing code, check how both apis use it. keep both workers on cloudflare's free plan and use the browser for media conversion.

## adding a service

support freely accessible public media. skip private, paywalled, and drm-protected content. only collect the information needed to resolve a download or fill in its metadata. if you're unsure whether a feature fits, open an issue before building it.

1. put worker-specific adapter code in [api/worker](api/worker/) and register it in [media.js](api/worker/media.js). reuse the [shared link patterns](api/src/processing/service-config.js) where they fit.
2. list the provider's metadata hosts in the adapter registration and its download hosts in [tunnel.js](api/worker/tunnel.js). keep the lists specific to the hosts the provider needs.
3. update the [service coverage table](docs/run-on-workers.md#what-you-can-download). include the link types and formats you verified.

## checking your changes

- run `pnpm test:workers` for api and adapter changes. the [worker tests](api/worker/test/worker.js) mock providers and turnstile.
- run `pnpm --filter @imput/cobalt-web check` for frontend changes. try the affected flow in a browser.
- for an adapter change, try a public link through a running worker and open the saved file. tell us what you tested and where you ran it.

keep `*.test` and `*.test.*` files temporary and out of commits. keep local bindings, secrets, and build output out of git.

## writing and translations

edit copy for this port in [web/i18n](web/i18n/), under the matching language. use casual, lowercase copy. keep names like cobalt-to-workers, cobalt, and imput as written. leave translation keys and placeholders intact, and only translate languages you know well.

## commits and pull requests

use a short lowercase subject. add a scope if it helps, like `workers: fix twitch clip links`. use the commit body to explain decisions that need more context. give each provider a separate commit so it can be reviewed and reverted independently.

rebase your branch onto this repo's `main` when it needs an update. fold fixes into the commit they belong to while you're still working on your branch. if you need to update an already-pushed branch you own after a rebase, use `git push --force-with-lease`.

in the pull request, tell us what changed and how you checked it. for download changes, include a public example link and the mode you tried.
