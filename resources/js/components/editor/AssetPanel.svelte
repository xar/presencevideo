<script lang="ts">
    import { Upload, Image, Video, Music, Loader2, Sparkles, Info, Search, X } from 'lucide-svelte';
    import AssetDetailsDialog from '@/components/editor/AssetDetailsDialog.svelte';
    import AssetThumbnail from '@/components/editor/AssetThumbnail.svelte';
    import UploadQueueStatus from '@/components/editor/UploadQueueStatus.svelte';
    import { Button } from '@/components/ui/button';
    import { Separator } from '@/components/ui/separator';
    import { projectStore, generationTracker } from '@/lib/editor';
    import { addAssetToEditor, addVisualAssetAsScene, serializeAssetDragData } from '@/lib/editor/asset-actions';
    import {
        assetDisplayName,
        assetInfoRows,
        assetPrompt,
        countAssetUsages,
        formatAssetDimensions,
        formatAssetDuration,
        formatRelativeTime,
    } from '@/lib/editor/asset-info';
    import { uploadQueue } from '@/lib/editor/upload-queue.svelte';
    import type { Asset, AssetType } from '@/types';

    let query = $state('');
    let detailsAsset = $state<Asset | null>(null);
    let detailsOpen = $state(false);

    let assets = $derived(
        [...(projectStore.project?.assets ?? [])].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        ),
    );

    /** Prompt text is searchable too: generated clips are found by what they show. */
    let matchingAssets = $derived.by(() => {
        const needle = query.trim().toLowerCase();
        if (needle === '') return assets;

        return assets.filter((asset) =>
            `${asset.name ?? ''} ${assetPrompt(asset) ?? ''}`.toLowerCase().includes(needle),
        );
    });

    let imageAssets = $derived(matchingAssets.filter((a) => a.type === 'image'));
    let videoAssets = $derived(matchingAssets.filter((a) => a.type === 'video'));
    let audioAssets = $derived(matchingAssets.filter((a) => a.type === 'audio'));
    let pendingGenerations = $derived(generationTracker.generations);

    let fileInput: HTMLInputElement;
    let clickTimer: ReturnType<typeof setTimeout> | null = null;

    function openFileDialog(type: AssetType) {
        if (fileInput && !uploadQueue.isUploading) {
            fileInput.accept = type === 'image' ? 'image/*' : type === 'video' ? 'video/*' : 'audio/*';
            fileInput.dataset.type = type;
            fileInput.click();
        }
    }

    async function handleFileSelect(e: Event) {
        const input = e.target as HTMLInputElement;
        const files = input.files;
        const type = input.dataset.type as AssetType;

        if (!files?.length || !projectStore.project) return;

        await uploadQueue.upload(projectStore.project.id, files, type);
        input.value = '';
    }

    function handleAssetClick(asset: Asset) {
        if (clickTimer) {
            clearTimeout(clickTimer);
        }

        clickTimer = setTimeout(() => {
            addAssetToEditor(asset);
            clickTimer = null;
        }, 220);
    }

    function handleAssetDoubleClick(asset: Asset) {
        if (clickTimer) {
            clearTimeout(clickTimer);
            clickTimer = null;
        }

        if (asset.type === 'audio') {
            addAssetToEditor(asset);
            return;
        }

        addVisualAssetAsScene(asset);
    }

    function handleDragStart(e: DragEvent, asset: Asset) {
        if (!e.dataTransfer) return;
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('application/json', serializeAssetDragData(asset));
    }

    function showDetails(asset: Asset) {
        detailsAsset = asset;
        detailsOpen = true;
    }

    /**
     * The hover card: every fact about the asset as plain text, so the panel
     * itself stays a grid of pictures. Native `title` rather than a popover so
     * it never fights the drag gesture the tiles are built around.
     */
    function tooltipFor(asset: Asset): string {
        const usages = countAssetUsages(projectStore.project, asset.id);
        const lines = [
            assetDisplayName(asset),
            ...assetInfoRows(asset).map((row) => `${row.label}: ${row.value}`),
            `Used: ${usages === 0 ? 'not yet' : `${usages}×`}`,
        ];

        const prompt = assetPrompt(asset);
        if (prompt) lines.push('', prompt);

        lines.push('', 'Click to add · Double-click for a new scene · Drag onto the canvas');

        return lines.join('\n');
    }
</script>

<input
    bind:this={fileInput}
    type="file"
    class="hidden"
    onchange={handleFileSelect}
    multiple
/>

{#snippet visualTile(asset: Asset)}
    {@const duration = formatAssetDuration(asset.duration_ms)}
    {@const dimensions = formatAssetDimensions(asset.width, asset.height)}
    <div class="group relative">
        <button
            type="button"
            class="block aspect-video w-full overflow-hidden rounded border bg-muted hover:ring-2 hover:ring-primary cursor-grab active:cursor-grabbing"
            title={tooltipFor(asset)}
            onclick={() => handleAssetClick(asset)}
            ondblclick={() => handleAssetDoubleClick(asset)}
            draggable="true"
            ondragstart={(e) => handleDragStart(e, asset)}
        >
            <AssetThumbnail {asset} />
        </button>

        <!-- Badges sit above the thumbnail button; they never swallow its clicks. -->
        <div class="pointer-events-none absolute inset-x-1 bottom-1 flex items-end justify-between gap-1">
            {#if duration}
                <span class="rounded bg-black/70 px-1 text-[10px] font-medium leading-4 text-white tabular-nums">
                    {duration}
                </span>
            {:else if asset.type === 'video'}
                <span class="rounded bg-black/50 px-1 text-[10px] leading-4 text-white/70">--:--</span>
            {:else}
                <span></span>
            {/if}
            {#if dimensions}
                <span class="rounded bg-black/60 px-1 text-[10px] leading-4 text-white/80 opacity-0 transition-opacity group-hover:opacity-100">
                    {dimensions}
                </span>
            {/if}
        </div>

        {#if asset.source === 'generated'}
            <span
                class="pointer-events-none absolute left-1 top-1 rounded bg-primary/90 p-0.5 text-primary-foreground"
                title="AI generated"
            >
                <Sparkles class="h-2.5 w-2.5" />
            </span>
        {/if}

        <button
            type="button"
            class="absolute right-1 top-1 rounded bg-black/70 p-1 text-white opacity-0 transition-opacity hover:bg-black focus-visible:opacity-100 group-hover:opacity-100"
            title="Asset details"
            aria-label="Asset details"
            onclick={(e) => {
                e.stopPropagation();
                showDetails(asset);
            }}
        >
            <Info class="h-3 w-3" />
        </button>

        <p class="mt-1 truncate text-[10px] leading-tight text-muted-foreground" title={asset.name}>
            {assetDisplayName(asset)}
        </p>
    </div>
{/snippet}

<div class="flex w-64 flex-col border-r bg-background">
    <div class="flex items-center justify-between p-3 border-b">
        <h2 class="text-sm font-semibold">
            Assets
            {#if assets.length > 0}
                <span class="ml-1 text-xs font-normal text-muted-foreground">{assets.length}</span>
            {/if}
        </h2>
        <Button variant="ghost" size="icon" class="h-6 w-6" onclick={() => openFileDialog('image')}>
            <Upload class="h-3 w-3" />
        </Button>
    </div>

    {#if assets.length > 4}
        <div class="relative border-b p-2">
            <Search class="pointer-events-none absolute left-4 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <input
                bind:value={query}
                type="search"
                placeholder="Search assets and prompts"
                class="h-7 w-full rounded border bg-muted/40 pl-7 pr-6 text-xs outline-none focus:ring-1 focus:ring-primary"
            />
            {#if query !== ''}
                <button
                    type="button"
                    class="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                    onclick={() => (query = '')}
                >
                    <X class="h-3 w-3" />
                </button>
            {/if}
        </div>
    {/if}

    <div class="flex-1 overflow-y-auto p-2 space-y-4">
        {#if pendingGenerations.length > 0}
            <div>
                <div class="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
                    <Sparkles class="h-3 w-3" />
                    Generating
                </div>
                <div class="space-y-2">
                    {#each pendingGenerations as gen (gen.id)}
                        {@const genTypeLabel = gen.type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                        <div class="flex items-center gap-2 rounded border border-primary/30 bg-primary/5 p-2 text-xs">
                            {#if gen.status === 'failed'}
                                <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-destructive/10">
                                    <Sparkles class="h-4 w-4 text-destructive" />
                                </div>
                            {:else}
                                <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary/10">
                                    <Loader2 class="h-4 w-4 text-primary animate-spin" />
                                </div>
                            {/if}
                            <div class="flex-1 min-w-0">
                                <p class="font-medium truncate">{genTypeLabel}</p>
                                <p class="text-muted-foreground truncate" title={gen.prompt}>{gen.prompt}</p>
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}

        {#if imageAssets.length > 0}
            <div>
                <div class="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
                    <Image class="h-3 w-3" />
                    Images
                    <span class="ml-auto tabular-nums">{imageAssets.length}</span>
                </div>
                <div class="grid grid-cols-2 gap-2">
                    {#each imageAssets as asset (asset.id)}
                        {@render visualTile(asset)}
                    {/each}
                </div>
            </div>
        {/if}

        {#if videoAssets.length > 0}
            <div>
                <div class="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
                    <Video class="h-3 w-3" />
                    Videos
                    <span class="ml-auto tabular-nums">{videoAssets.length}</span>
                </div>
                <div class="grid grid-cols-2 gap-2">
                    {#each videoAssets as asset (asset.id)}
                        {@render visualTile(asset)}
                    {/each}
                </div>
            </div>
        {/if}

        {#if audioAssets.length > 0}
            <div>
                <div class="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
                    <Music class="h-3 w-3" />
                    Audio
                    <span class="ml-auto tabular-nums">{audioAssets.length}</span>
                </div>
                <div class="space-y-1">
                    {#each audioAssets as asset (asset.id)}
                        {@const duration = formatAssetDuration(asset.duration_ms)}
                        <div class="group relative">
                            <button
                                type="button"
                                class="w-full flex items-center gap-2 rounded border p-2 pr-12 text-left text-xs hover:bg-muted hover:ring-2 hover:ring-primary cursor-grab active:cursor-grabbing"
                                title={tooltipFor(asset)}
                                onclick={() => handleAssetClick(asset)}
                                ondblclick={() => handleAssetDoubleClick(asset)}
                                draggable="true"
                                ondragstart={(e) => handleDragStart(e, asset)}
                            >
                                {#if asset.source === 'generated'}
                                    <Sparkles class="h-3 w-3 shrink-0 text-primary" />
                                {:else}
                                    <Music class="h-3 w-3 shrink-0 text-muted-foreground" />
                                {/if}
                                <span class="min-w-0 flex-1">
                                    <span class="block truncate">{assetDisplayName(asset)}</span>
                                    <span class="block truncate text-[10px] text-muted-foreground">
                                        {duration ?? 'Length unknown'} · {formatRelativeTime(asset.created_at)}
                                    </span>
                                </span>
                            </button>
                            <button
                                type="button"
                                class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                                title="Asset details"
                                aria-label="Asset details"
                                onclick={(e) => {
                                    e.stopPropagation();
                                    showDetails(asset);
                                }}
                            >
                                <Info class="h-3 w-3" />
                            </button>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}

        {#if uploadQueue.currentItem}
            <UploadQueueStatus />
        {:else if assets.length === 0 && pendingGenerations.length === 0}
            <div class="flex flex-col items-center justify-center py-8 text-center">
                <Upload class="h-8 w-8 text-muted-foreground/50" />
                <p class="mt-2 text-sm text-muted-foreground">No assets yet</p>
                <p class="text-xs text-muted-foreground">Upload or generate assets</p>
            </div>
        {:else if matchingAssets.length === 0}
            <p class="py-8 text-center text-xs text-muted-foreground">No assets match “{query}”</p>
        {/if}
    </div>

    <Separator />

    <div class="p-2 space-y-1">
        <Button variant="outline" size="sm" class="w-full justify-start" onclick={() => openFileDialog('image')} disabled={uploadQueue.isUploading}>
            <Image class="mr-2 h-3 w-3" />
            Upload Image
        </Button>
        <Button variant="outline" size="sm" class="w-full justify-start" onclick={() => openFileDialog('video')} disabled={uploadQueue.isUploading}>
            <Video class="mr-2 h-3 w-3" />
            Upload Video
        </Button>
        <Button variant="outline" size="sm" class="w-full justify-start" onclick={() => openFileDialog('audio')} disabled={uploadQueue.isUploading}>
            <Music class="mr-2 h-3 w-3" />
            Upload Audio
        </Button>
    </div>
</div>

<AssetDetailsDialog bind:open={detailsOpen} asset={detailsAsset} />
