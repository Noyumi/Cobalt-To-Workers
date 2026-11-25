# cobalt-to-workers

cobalt-to-workers is an independent, noncommercial fork of cobalt for cloudflare workers free. paste a public link to save a video, a track, or a photo. [try it at obscure.lol](https://obscure.lol)

one worker serves the site and another resolves links and streams files. your browser uses libav to merge tracks or convert files when a download needs it.

## run your own instance

- [set up and deploy on cloudflare workers](docs/run-on-workers.md)
- [see what you can download](docs/run-on-workers.md#what-you-can-download)
- [use the api](docs/api.md#using-the-api-on-workers)

### set it up with a coding agent

open this repo in your agent and paste this prompt.

```text
set up cobalt-to-workers from this checkout. read docs/run-on-workers.md
and api/.dev.vars.example. check my os and shell, configure both workers
for local development, and verify that the site can reach the api.

for cloudflare, ask if i want you to run the setup, give me commands to
paste into windows command prompt or my shell, or walk me through the
cloudflare dashboard on my pc. use the account and hostnames i choose.
cover both workers, turnstile, and the api bindings. keep secrets out of
chat and git. show me how to verify both deployed urls and a download.
```

## what's in this repo

- [api](api/README.md) for link resolution, turnstile, and file streaming
- [web](web/README.md) for the sveltekit site and browser media processing
- [packages](packages/) for shared code, including the api client

if you'd like to contribute, see the [contribution guidelines](CONTRIBUTING.md) for where to make changes and how to test them.

## thanks

thanks to [imput and the cobalt contributors](https://github.com/imputnet/cobalt) for making cobalt and sharing the code this port builds on.

a lot of this port was built with help from [codex](https://openai.com/codex/), openai's ai coding agent. codex helped adapt the api for workers, add download support, and test downloads and deployments.

## licenses

the api uses [agpl-3.0](api/LICENSE) and the frontend uses [cc by-nc-sa 4.0](web/LICENSE). the rest of the repo uses [agpl-3.0](LICENSE) unless specified otherwise. see the [frontend readme](web/README.md#license) for cobalt's branding and attribution terms.
