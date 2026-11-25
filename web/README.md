# cobalt-to-workers frontend

this [sveltekit](https://kit.svelte.dev/) app runs on cloudflare workers as static files. it sends requests to the api worker and uses libav to process files in the browser.

## run the frontend

follow the [workers guide](../docs/run-on-workers.md) to run the site and api together. for ui development from this directory, run `pnpm run dev`. run `pnpm run build` to build the static files in `web/build`.

## environment variables

set these before building the site or starting the vite dev server. the web app needs `WEB_DEFAULT_API` to resolve downloads.

| name | example | description |
| --- | --- | --- |
| `WEB_DEFAULT_API` | `https://api.example.com` | origin of your api worker |
| `WEB_HOST` | `media.example.com` | frontend hostname for metadata and optional analytics |
| `WEB_SOURCE_URL` | `https://media.example.com/source.zip` | source for the deployed version, linked on the credits page |
| `WEB_PLAUSIBLE_HOST` | `analytics.example.com` | optional plausible analytics hostname |
| `WEB_ENABLE_DEPRECATED_YOUTUBE_HLS` | `true` | shows the legacy youtube hls setting for upstream apis |

use your own analytics hostname for plausible community edition. see the [plausible docs](https://plausible.io/docs) for setup.

## link prefill
put a url after `#` to fill the input and start the download.
```
https://media.example.com/#https://www.youtube.com/watch?v=dQw4w9WgXcQ
```

you can also use an encoded url.
```
https://media.example.com/#https%3A//www.youtube.com/watch%3Fv=dQw4w9WgXcQ
```

## license
cobalt web code is licensed under [CC-BY-NC-SA-4.0](LICENSE).

this license allows you to:
- copy and redistribute the code in any medium or format, and
- remix, transform, use and build upon the code

as long as you:
- give appropriate credit to the original repo,
- provide a link to the license and indicate if changes to the code were made,
- release the code under the **same license**, and
- **don't use the code for any commercial purposes**.

cobalt branding, mascots, and other related assets included in the repo are ***copyrighted*** and not covered by the license. you ***cannot*** use them under same terms.

you are allowed to host an ***unmodified*** instance of cobalt with branding for **non-commercial purposes**, but this ***does not*** give you permission to use the branding anywhere else, or make derivatives of it in any way.

when making an alternative version of the project, please replace or remove all branding (including the name).

## open source acknowledgments
### svelte + sveltekit
the cobalt frontend is built using [svelte](https://svelte.dev) and [sveltekit](https://svelte.dev/docs/kit/introduction), a really efficient and badass framework, we love it a lot.

### libav.js
our remux and encode workers rely on [libav.js](https://github.com/imputnet/libav.js), which is an optimized build of ffmpeg for the browser. the ffmpeg builds are made up of many components, whose licenses can be found here: [encode](https://github.com/imputnet/libav.js/blob/main/configs/configs/encode/license.js), [remux](https://github.com/imputnet/libav.js/blob/main/configs/configs/remux/license.js).

you can [support ffmpeg here](https://ffmpeg.org/donations.html)!

### fonts, icons and assets
the cobalt frontend uses several different fonts and icon sets.
- [Tabler Icons](https://tabler.io/icons), released under the [MIT](https://github.com/tabler/tabler-icons?tab=MIT-1-ov-file) license.
- [Fluent Emoji by Microsoft](https://github.com/microsoft/fluentui-emoji), released under the [MIT](https://github.com/microsoft/fluentui-emoji/blob/main/LICENSE) license.
- [Noto Sans Mono](https://fonts.google.com/noto/specimen/Noto+Sans+Mono/) used for the download button, is licensed under the [OFL](https://fonts.google.com/noto/specimen/Noto+Sans+Mono/about) license.
- [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono/) used for all other text, is licensed under the [OFL](https://fonts.google.com/specimen/IBM+Plex+Mono/license) license.
- and the [Redaction](https://redaction.us/) font, which is licensed under the [OFL](https://github.com/fontsource/font-files/blob/main/fonts/other/redaction-10/LICENSE) license (as well as LGPL-2.1).
- many update banners were taken from [tenor.com](https://tenor.com/).

### other packages
- [mdsvex](https://github.com/pngwn/MDsveX) to convert the changelogs into svelte components.
- [compare-versions](https://github.com/omichelsen/compare-versions) for sorting the changelogs.
- [svelte-sitemap](https://github.com/bartholomej/svelte-sitemap) for generating a sitemap for the frontend.
- [sveltekit-i18n](https://github.com/sveltekit-i18n/lib) for displaying cobalt in many different languages.
- [vite](https://github.com/vitejs/vite) for building the frontend.

...and many other packages that these packages rely on.
