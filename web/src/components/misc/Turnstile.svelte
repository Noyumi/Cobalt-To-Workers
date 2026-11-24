<script lang="ts">
    import { onMount } from "svelte";
    import { t } from "$lib/i18n/translations";
    import type { TurnstilePrompt } from "$lib/state/turnstile";

    export let prompt: TurnstilePrompt;

    let dialog: HTMLDialogElement;
    let widget: HTMLDivElement;
    let rendered = false;

    const cancel = () => prompt.finish({ error: "error.captcha_cancelled" });
    const fail = () => prompt.finish({ error: "error.captcha_failed" });

    onMount(() => {
        dialog.showModal();
        let widgetId: string | undefined;
        let script: HTMLScriptElement | undefined;

        const render = () => {
            if (!window.turnstile) {
                fail();
                return;
            }

            try {
                widgetId = window.turnstile.render(widget, {
                    sitekey: prompt.sitekey,
                    size: window.innerWidth < 360 ? "compact" : "flexible",
                    callback: token => prompt.finish({ token }),
                    "error-callback": () => { fail(); return true; },
                });
                rendered = true;
            } catch {
                fail();
            }
        };

        if (window.turnstile) {
            render();
        } else {
            script = document.createElement("script");
            script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
            script.onload = render;
            script.onerror = fail;
            document.head.append(script);
        }

        return () => {
            if (script) {
                script.onload = null;
                script.onerror = null;
                script.remove();
            }
            if (widgetId) window.turnstile?.remove(widgetId);
            if (dialog.open) dialog.close();
        };
    });
</script>

<dialog class="turnstile" aria-label={$t("dialog.verify_download")} bind:this={dialog} on:cancel|preventDefault={cancel}>
    {#if !rendered}
        <span role="status">{$t("dialog.verify_download")}</span>
    {/if}
    <div class="widget" bind:this={widget}></div>
    <button type="button" class="button" on:click={cancel}>{$t("button.cancel")}</button>
</dialog>

<style>
    dialog.turnstile:modal {
        box-sizing: border-box;
        inset: 0;
        margin: auto;
        width: min(336px, calc(100% - 24px));
        height: fit-content;
        max-height: calc(100% - 24px);
        padding: 12px;
        gap: 8px;
        justify-content: center;
        overflow: auto;
        background: var(--popup-bg);
        color: var(--secondary);
        border: 1px solid var(--popup-stroke);
        border-radius: var(--border-radius);
    }

    dialog.turnstile:modal::backdrop {
        display: block;
        background: var(--dialog-backdrop);
    }

    .widget {
        width: 100%;
        display: grid;
        place-items: center;
    }

    button {
        min-height: 36px;
    }
</style>
