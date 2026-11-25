<script lang="ts">
    import locale from "$lib/i18n/locale";

    import { contacts } from "$lib/env";
    import { t } from "$lib/i18n/translations";

    import AboutSupport from "$components/about/AboutSupport.svelte";

    let buttonContainerWidth: number;
</script>

<div id="support-page">
    <section class="port-support" aria-labelledby="port-support-heading">
        <h2 id="port-support-heading">cobalt-to-workers</h2>
        <ul>
            <li>
                <a href="https://github.com/Noyumi/Cobalt-To-Workers">{$t("about.support.port_repo")}</a>
            </li>
            <li>
                <a href="https://github.com/Noyumi">{$t("about.support.port_maintainer")}</a>
            </li>
            <li>
                <a href="https://discord.com/users/1021210809164111932">
                    {$t("about.support.port_discord")} <code>1021210809164111932</code>
                </a>
            </li>
        </ul>
    </section>

    <p class="subtext support-note">{$t("about.support.upstream")}</p>
    <div
        id="support-buttons"
        bind:offsetWidth={buttonContainerWidth}

        class="two"
        class:one={buttonContainerWidth < 500}
    >
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
        margin: 0 0 8px;
        font-size: 1.125rem;
    }

    .port-support ul {
        display: grid;
        gap: 8px;
        margin: 0;
        padding-inline-start: 1.25rem;
    }

    .port-support code {
        user-select: text;
    }

    #support-buttons {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        overflow-x: scroll;
        gap: var(--padding);
    }

    #support-buttons.two {
        grid-template-columns: 1fr 1fr;
    }

    #support-buttons.one {
        grid-template-columns: 1fr;
    }

    .support-note {
        text-align: start;
        padding: 0;
    }
</style>
