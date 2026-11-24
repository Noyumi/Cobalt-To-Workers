<script lang="ts">
    import { projectName } from "$lib/env";
    import { t } from "$lib/i18n/translations";
</script>

<svelte:head>
    <title>{$t("tabs.donate")} ~ {projectName}</title>
    <meta property="og:title" content="{$t('tabs.donate')} ~ {projectName}" />
</svelte:head>

<main class="long-text">
    <h1>{$t("donate.upstream.title")}</h1>
    <p>{$t("donate.upstream.description")}</p>
    <p><a href="https://cobalt.tools/donate">{$t("donate.upstream.link")}</a></p>
</main>

<style>
    main {
        max-width: 65ch;
        padding: var(--padding);
    }
</style>
