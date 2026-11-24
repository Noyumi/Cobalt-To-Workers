<script lang="ts">
    import { browser } from "$app/environment";
    import SmallDialog from "$components/dialog/SmallDialog.svelte";
</script>

{#if !browser}
    <noscript style="display: contents">
        <div id="nojs-ack">
            <SmallDialog
                id="nojs-dialog"
                bodyText="Enable JavaScript to download and convert files."
                buttons={[
                    {
                        text: "got it",
                        main: true,
                        action: () => {},
                        link: "#nojs-ack"
                    },
                ]}
            />
            <div id="nojs-dialog-backdrop"></div>
        </div>
    </noscript>
{/if}

<style>
    :global(#nojs-ack) {
        display: contents;
    }

    :global(#nojs-ack:target) {
        display: none;
    }

    #nojs-dialog-backdrop {
        opacity: 1;
    }
</style>
