<script lang="ts">
    import locale from "$lib/i18n/locale";

    import { contacts } from "$lib/env";
    import { t } from "$lib/i18n/translations";

    import AboutSupport from "$components/about/AboutSupport.svelte";

    let supportWidth: number;
</script>

<div id="support-page" bind:offsetWidth={supportWidth} class:stacked={supportWidth < 500}>
    <section class="port-support" aria-labelledby="port-support-heading">
        <h2 id="port-support-heading">cobalt-to-workers</h2>
        <div class="support-grid">
            <AboutSupport
                platform="github"
                externalLink="https://github.com/Noyumi/Cobalt-To-Workers"
            >
                {$t("about.support.port_repo")}
            </AboutSupport>
            <AboutSupport
                platform="github"
                title="noyumi"
                externalLink="https://github.com/Noyumi"
            >
                {$t("about.support.port_maintainer")}
            </AboutSupport>
            <AboutSupport
                platform="discord"
                externalLink="https://discord.com/users/1021210809164111932"
            >
                {$t("about.support.port_discord")} <code>1021210809164111932</code>
            </AboutSupport>
        </div>
    </section>

    <p class="subtext support-note">{$t("about.support.upstream")}</p>
    <div class="support-grid">
        <AboutSupport
            platform="github"
            externalLink={contacts.github}
        />

        {#if $locale === "ru"}
            <AboutSupport
                platform="telegram"
                externalLink={contacts.telegram_ru}
            />
        {:else}
            <AboutSupport
                platform="discord"
                externalLink={contacts.discord}
            />
            <AboutSupport
                platform="twitter"
                externalLink={contacts.twitter}
            />
            <AboutSupport
                platform="bluesky"
                externalLink={contacts.bluesky}
            />
        {/if}
    </div>

</div>

<style>
    #support-page {
        display: flex;
        flex-direction: column;
        gap: 18px;
    }

    .port-support h2 {
        margin: 0 0 var(--padding);
        font-size: 1.125rem;
    }

    .support-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--padding);
    }

    .stacked .support-grid {
        grid-template-columns: minmax(0, 1fr);
    }

    .support-note {
        text-align: start;
        padding: 0;
    }
</style>
