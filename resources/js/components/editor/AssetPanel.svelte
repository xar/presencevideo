<script lang="ts">
    import { projectStore, selectionStore } from '@/lib/editor';
    import { Button } from '@/components/ui/button';
    import { Separator } from '@/components/ui/separator';
    import type { Asset, AssetType } from '@/types';
    import { Upload, Image, Video, Music, Sparkles, Plus } from 'lucide-svelte';
    import { router } from '@inertiajs/svelte';

    let assets = $derived(projectStore.project?.assets ?? []);
    let imageAssets = $derived(assets.filter((a) => a.type === 'image'));
    let videoAssets = $derived(assets.filter((a) => a.type === 'video'));
    let audioAssets = $derived(assets.filter((a) => a.type === 'audio'));

    let isUploading = $state(false);
    let fileInput: HTMLInputElement;

    function openFileDialog(type: AssetType) {
        if (fileInput) {
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

        for (const file of files) {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('type', type);

            try {
                await fetch(`/editor/projects/${projectStore.project.id}/assets`, {
                    method: 'POST',
                    body: formData,
                    headers: {
                        'X-CSRF-TOKEN': document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '',
                    },
                });

                router.reload({ only: ['project'] });
            } catch (err) {
                console.error('Upload failed:', err);
            }
        }

        isUploading = false;
        input.value = '';
    }

    function addAssetToScene(asset: Asset) {
        const selectedScene = selectionStore.getSelectedScene();
        if (!selectedScene) return;

        const layerType = asset.type === 'audio' ? null : asset.type;
        if (!layerType) return;

        projectStore.addLayer(selectedScene.id, {
            type: layerType,
            asset_id: asset.id,
            x: 0,
            y: 0,
            width: asset.width ?? projectStore.project!.resolution_width,
            height: asset.height ?? projectStore.project!.resolution_height,
        });
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
                            class="aspect-video rounded border bg-muted overflow-hidden hover:ring-2 hover:ring-primary"
                            onclick={() => addAssetToScene(asset)}
                        >
                            <img
                                src={asset.thumbnail_url ?? asset.url}
                                alt={asset.name}
                                class="h-full w-full object-cover"
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
                            class="aspect-video rounded border bg-muted overflow-hidden hover:ring-2 hover:ring-primary"
                            onclick={() => addAssetToScene(asset)}
                        >
                            {#if asset.thumbnail_url}
                                <img
                                    src={asset.thumbnail_url}
                                    alt={asset.name}
                                    class="h-full w-full object-cover"
                                />
                            {:else}
                                <div class="flex h-full items-center justify-center">
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

        {#if assets.length === 0}
            <div class="flex flex-col items-center justify-center py-8 text-center">
                <Upload class="h-8 w-8 text-muted-foreground/50" />
                <p class="mt-2 text-sm text-muted-foreground">No assets yet</p>
                <p class="text-xs text-muted-foreground">Upload or generate assets</p>
            </div>
        {/if}
    </div>

    <Separator />

    <div class="p-2 space-y-1">
        <Button variant="outline" size="sm" class="w-full justify-start" onclick={() => openFileDialog('image')}>
            <Image class="mr-2 h-3 w-3" />
            Upload Image
        </Button>
        <Button variant="outline" size="sm" class="w-full justify-start" onclick={() => openFileDialog('video')}>
            <Video class="mr-2 h-3 w-3" />
            Upload Video
        </Button>
        <Button variant="outline" size="sm" class="w-full justify-start" onclick={() => openFileDialog('audio')}>
            <Music class="mr-2 h-3 w-3" />
            Upload Audio
        </Button>
    </div>
</div>
