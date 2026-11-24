<script lang="ts">
    import env from "$lib/env";
</script>

# Credits and licenses

This project is a modified version of [Cobalt by imput](https://github.com/imputnet/cobalt). The frontend uses Cobalt's SvelteKit interface and browser media processing, with a new name, artwork, and Cloudflare Workers API.

{#if env.SOURCE_URL}
<p><a href={env.SOURCE_URL}>Browse the source code for this instance</a>.</p>
{/if}

The API is licensed under [AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html). The frontend is licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/), which limits use to noncommercial purposes.
