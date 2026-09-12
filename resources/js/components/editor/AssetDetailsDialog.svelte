<script lang="ts">
    import { Check, Copy, ExternalLink, Plus, Trash2 } from 'lucide-svelte';
    import { Button } from '@/components/ui/button';
    import {
        Dialog,
        DialogContent,
        DialogDescription,
        DialogFooter,
        DialogTitle,
    } from '@/components/ui/dialog';
    import { projectStore } from '@/lib/editor';
    import { addAssetToEditor, deleteAsset } from '@/lib/editor/asset-actions';
    import {
        assetDisplayName,
        assetInfoRows,
        assetPrompt,
        assetSourceLabel,
        countAssetUsages,
    } from '@/lib/editor/asset-info';
    import type { Asset } from '@/types';

    /**
     * Everything known about one asset, plus the actions that only make sense
     * once you can see it: add it to the edit, open the original, delete it.
     */
    let {
        open = $bindable(false),
        asset,
    }: {
        open: boolean;
        asset: Asset | null;
    } = $props();

    let promptCopied = $state(false);

    let isDeleting = $state(false);
    let deleteError = $state<string | null>(null);
    let confirmingDelete = $state(false);

    let rows = $derived(asset ? assetInfoRows(asset) : []);
    let prompt = $derived(asset ? assetPrompt(asset) : null);
    let usageCount = $derived(asset ? countAssetUsages(projectStore.project, asset.id) : 0);

    function close() {
        open = false;
        confirmingDelete = false;
        deleteError = null;
        promptCopied = false;
    }

    $effect(() => {
        asset?.id;
        confirmingDelete = false;
        deleteError = null;
        promptCopied = false;
    });

    async function copyPrompt() {
        if (!prompt) return;

        await navigator.clipboard.writeText(prompt);
        promptCopied = true;
        setTimeout(() => (promptCopied = false), 1500);
    }

    async function confirmDelete() {
        if (!asset) return;

        if (!confirmingDelete) {
            confirmingDelete = true;
            return;
        }

        isDeleting = true;
        deleteError = null;

        try {
            await deleteAsset(asset);
            close();
        } catch (error) {
            deleteError = error instanceof Error ? error.message : 'Delete failed';
        } finally {
            isDeleting = false;
        }
    }
</script>

<Dialog bind:open>
    <DialogContent class="sm:max-w-lg">
        {#if asset}
            <DialogTitle class="truncate pr-6">{assetDisplayName(asset)}</DialogTitle>
            <DialogDescription>
                {assetSourceLabel(asset)} · {asset.type}
                {#if usageCount > 0}
                    · used {usageCount} {usageCount === 1 ? 'time' : 'times'} in this project
                {:else}
                    · not used yet
                {/if}
            </DialogDescription>

            <div class="space-y-4 py-2">
                <div class="overflow-hidden rounded-md border bg-black/40">
                    {#if asset.type === 'image'}
                        <img src={asset.url} alt={asset.name} class="max-h-64 w-full object-contain" />
                    {:else if asset.type === 'video'}
                        <!-- svelte-ignore a11y_media_has_caption -->
                        <video src={asset.url} class="max-h-64 w-full object-contain" controls preload="metadata"></video>
                    {:else}
                        <audio src={asset.url} class="w-full p-3" controls preload="metadata"></audio>
                    {/if}
                </div>

                <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    {#each rows as row (row.label)}
                        <div class="contents">
                            <dt class="text-muted-foreground">{row.label}</dt>
                            <dd class="truncate font-medium" title={row.value}>{row.value}</dd>
                        </div>
                    {/each}
                </dl>

                {#if prompt}
                    <div class="space-y-1">
                        <div class="flex items-center justify-between">
                            <span class="text-xs text-muted-foreground">Prompt</span>
                            <Button variant="ghost" size="sm" class="h-6 gap-1 px-2 text-xs" onclick={copyPrompt}>
                                {#if promptCopied}
                                    <Check class="h-3 w-3" /> Copied
                                {:else}
                                    <Copy class="h-3 w-3" /> Copy
                                {/if}
                            </Button>
                        </div>
                        <p class="max-h-24 overflow-y-auto rounded border bg-muted/50 p-2 text-xs leading-relaxed">
                            {prompt}
                        </p>
                    </div>
                {/if}

                {#if deleteError}
                    <p class="text-xs text-destructive">{deleteError}</p>
                {:else if confirmingDelete}
                    <p class="text-xs text-destructive">
                        Delete this file permanently?
                        {#if usageCount > 0}
                            {usageCount} {usageCount === 1 ? 'element' : 'elements'} on the timeline still use it.
                        {/if}
                    </p>
                {/if}
            </div>

            <DialogFooter class="gap-2 sm:justify-between">
                <Button
                    variant={confirmingDelete ? 'destructive' : 'ghost'}
                    size="sm"
                    disabled={isDeleting}
                    onclick={confirmDelete}
                >
                    <Trash2 class="mr-2 h-3 w-3" />
                    {confirmingDelete ? 'Confirm delete' : 'Delete'}
                </Button>
                <div class="flex gap-2">
                    <Button variant="outline" size="sm" asChild>
                        {#snippet children(props)}
                            <a class={props.class} href={asset?.url} target="_blank" rel="noopener">
                                <ExternalLink class="mr-2 h-3 w-3" />
                                Open
                            </a>
                        {/snippet}
                    </Button>
                    <Button
                        size="sm"
                        onclick={() => {
                            if (asset) addAssetToEditor(asset);
                            close();
                        }}
                    >
                        <Plus class="mr-2 h-3 w-3" />
                        Add to edit
                    </Button>
                </div>
            </DialogFooter>
        {/if}
    </DialogContent>
</Dialog>
