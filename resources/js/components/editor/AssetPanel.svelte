<script lang="ts">
    import { router } from '@inertiajs/svelte';
    import { Upload, Image, Video, Music, Loader2 } from 'lucide-svelte';
    import { Button } from '@/components/ui/button';
    import { Separator } from '@/components/ui/separator';
    import { projectStore, selectionStore } from '@/lib/editor';
    import type { Asset, AssetType } from '@/types';

    let assets = $derived(projectStore.project?.assets ?? []);
    let imageAssets = $derived(assets.filter((a) => a.type === 'image'));
    let videoAssets = $derived(assets.filter((a) => a.type === 'video'));
    let audioAssets = $derived(assets.filter((a) => a.type === 'audio'));

    let isUploading = $state(false);
    let uploadError = $state<string | null>(null);
    let fileInput: HTMLInputElement;

    function openFileDialog(type: AssetType) {
        if (fileInput && !isUploading) {
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

        isUploading = true;
        uploadError = null;

        for (const file of files) {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('type', type);

            try {
                // Get CSRF token from meta tag or cookie
                const csrfToken = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content
                    ?? document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1]?.replace(/%3D/g, '=')
                    ?? '';

                const response = await fetch(`/editor/projects/${projectStore.project.id}/assets`, {
                    method: 'POST',
                    body: formData,
                    credentials: 'same-origin',
                    headers: {
                        'X-CSRF-TOKEN': csrfToken,
                        'X-XSRF-TOKEN': csrfToken,
                        'Accept': 'application/json',
                    },
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.message || `Upload failed: ${response.status}`);
                }

                router.reload({ only: ['project'] });
            } catch (err) {
                console.error('Upload failed:', err);
                uploadError = err instanceof Error ? err.message : 'Upload failed';
            }
        }

        isUploading = false;
        input.value = '';
    }

    function handleDragStart(e: DragEvent, asset: Asset) {
        if (!e.dataTransfer) return;
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('application/json', JSON.stringify({
            type: 'asset',
            assetId: asset.id,
            assetType: asset.type,
            width: asset.width,
            height: asset.height,
        }));
    }

    function addAssetToScene(asset: Asset) {
        const selectedScene = selectionStore.getSelectedScene();
        if (!selectedScene) return;

        const layerType = asset.type === 'audio' ? null : asset.type;
        if (!layerType) return;

        const layer = projectStore.addLayer(selectedScene.id, {
            type: layerType,
            asset_id: asset.id,
            x: 0,
            y: 0,
            width: asset.width ?? projectStore.project!.resolution_width,
            height: asset.height ?? projectStore.project!.resolution_height,
        });

        selectionStore.selectLayer(selectedScene.id, layer.id);
    }
</script>

<input
    bind:this={fileInput}
    type="file"
    class="hidden"
    onchange={handleFileSelect}
    multiple
/>

<div class="flex w-64 flex-col border-r bg-background">
    <div class="flex items-center justify-between p-3 border-b">
        <h2 class="text-sm font-semibold">Assets</h2>
        <Button variant="ghost" size="icon" class="h-6 w-6" onclick={() => openFileDialog('image')}>
            <Upload class="h-3 w-3" />
        </Button>
    </div>

    <div class="flex-1 overflow-y-auto p-2 space-y-4">
        {#if imageAssets.length > 0}
            <div>
                <div class="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
                    <Image class="h-3 w-3" />
                    Images
                </div>
                <div class="grid grid-cols-2 gap-2">
                    {#each imageAssets as asset (asset.id)}
                        <button
                            type="button"
                            class="aspect-video rounded border bg-muted overflow-hidden hover:ring-2 hover:ring-primary cursor-grab active:cursor-grabbing"
                            onclick={() => addAssetToScene(asset)}
                            draggable="true"
                            ondragstart={(e) => handleDragStart(e, asset)}
                        >
                            <img
                                src={asset.thumbnail_url ?? asset.url}
                                alt={asset.name}
                                class="h-full w-full object-cover pointer-events-none"
                            />
                        </button>
                    {/each}
                </div>
            </div>
        {/if}

        {#if videoAssets.length > 0}
            <div>
                <div class="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
                    <Video class="h-3 w-3" />
                    Videos
                </div>
                <div class="grid grid-cols-2 gap-2">
                    {#each videoAssets as asset (asset.id)}
                        <button
                            type="button"
                            class="aspect-video rounded border bg-muted overflow-hidden hover:ring-2 hover:ring-primary cursor-grab active:cursor-grabbing"
                            onclick={() => addAssetToScene(asset)}
                            draggable="true"
                            ondragstart={(e) => handleDragStart(e, asset)}
                        >
                            {#if asset.thumbnail_url}
                                <img
                                    src={asset.thumbnail_url}
                                    alt={asset.name}
                                    class="h-full w-full object-cover pointer-events-none"
                                />
                            {:else}
                                <div class="flex h-full items-center justify-center pointer-events-none">
                                    <Video class="h-6 w-6 text-muted-foreground" />
                                </div>
                            {/if}
                        </button>
                    {/each}
                </div>
            </div>
        {/if}

        {#if audioAssets.length > 0}
            <div>
                <div class="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
                    <Music class="h-3 w-3" />
                    Audio
                </div>
                <div class="space-y-1">
                    {#each audioAssets as asset (asset.id)}
                        <button
                            type="button"
                            class="w-full flex items-center gap-2 rounded border p-2 text-left text-xs hover:bg-muted"
                            onclick={() => {}}
                        >
                            <Music class="h-4 w-4 text-muted-foreground" />
                            <span class="truncate flex-1">{asset.name}</span>
                        </button>
                    {/each}
                </div>
            </div>
        {/if}

        {#if isUploading}
            <div class="flex flex-col items-center justify-center py-8 text-center">
                <Loader2 class="h-8 w-8 text-primary animate-spin" />
                <p class="mt-2 text-sm text-muted-foreground">Uploading...</p>
            </div>
        {:else if uploadError}
            <div class="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">
                {uploadError}
                <button type="button" class="ml-2 underline" onclick={() => uploadError = null}>Dismiss</button>
            </div>
        {:else if assets.length === 0}
            <div class="flex flex-col items-center justify-center py-8 text-center">
                <Upload class="h-8 w-8 text-muted-foreground/50" />
                <p class="mt-2 text-sm text-muted-foreground">No assets yet</p>
                <p class="text-xs text-muted-foreground">Upload or generate assets</p>
            </div>
        {/if}
    </div>

    <Separator />

    <div class="p-2 space-y-1">
        <Button variant="outline" size="sm" class="w-full justify-start" onclick={() => openFileDialog('image')} disabled={isUploading}>
            <Image class="mr-2 h-3 w-3" />
            Upload Image
        </Button>
        <Button variant="outline" size="sm" class="w-full justify-start" onclick={() => openFileDialog('video')} disabled={isUploading}>
            <Video class="mr-2 h-3 w-3" />
            Upload Video
        </Button>
        <Button variant="outline" size="sm" class="w-full justify-start" onclick={() => openFileDialog('audio')} disabled={isUploading}>
            <Music class="mr-2 h-3 w-3" />
            Upload Audio
        </Button>
    </div>
</div>
