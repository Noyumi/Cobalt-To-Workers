---
title: "cobalt on cloudflare workers"
date: "24 November, 2026"
---

Cobalt-To-Workers is an unaffiliated, third-party port of [cobalt by imput](https://github.com/imputnet/cobalt). the older posts here are cobalt's upstream release notes.

## how it runs
- one cloudflare worker serves the site. a second worker resolves links and streams downloads. you can run both on cloudflare's free plan without a separate server.
- when a download needs merging or conversion, your browser does the work. you can follow it in the processing queue.

## what you can download
paste a link to save video, audio, or photos from supported sites. you can try youtube audio, soundcloud tracks, streamable videos, or photo posts from tiktok and bluesky. available formats depend on what each site sends back.
