<script lang="ts">
    import env from "$lib/env";
</script>

# Авторы и лицензии

Этот проект основан на [Cobalt от imput](https://github.com/imputnet/cobalt). Он использует интерфейс Cobalt на SvelteKit и обработку медиа в браузере. В этой версии изменены название и оформление, а API перенесён на Cloudflare Workers.

{#if env.SOURCE_URL}
<p><a href={env.SOURCE_URL}>Исходный код этого инстанса</a>.</p>
{/if}

API распространяется по лицензии [AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html). Интерфейс распространяется по лицензии [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/), которая ограничивает использование некоммерческими целями.
