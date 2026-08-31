<script lang="ts">
    import { ImageIcon, Video } from 'lucide-svelte';
    import type { Asset, Scene } from '@/types';

    const THUMBNAIL_TILE_WIDTH = 80;
    const MAX_THUMBNAILS = 12;

    let {
        scene,
        assets = [],
        alt,
        width,
    }: {
        scene: Scene;
        assets?: Asset[];
        alt: string;
        width?: number;
    } = $props();
    let imageLoadFailed = $state(false);
    let lastPreviewKey = $state('');
    let generatedThumbnailUrls = $state<string[]>([]);
    let isGenerating = $state(false);

    let visualLayer = $derived.by(() => scene.layers.find((layer) => layer.type === 'image' || layer.type === 'video'));

    let previewAsset = $derived.by(() => {
        if (!visualLayer || !('asset_id' in visualLayer)) return null;

        return assets.find((asset) => asset.id === visualLayer.asset_id) ?? null;
    });

    let fallbackPreviewUrl = $derived.by(() => {
        if (scene.thumbnail_url && !imageLoadFailed) return scene.thumbnail_url;
        if (!previewAsset) return null;

        if (previewAsset.thumbnail_url && !imageLoadFailed) {
            return previewAsset.thumbnail_url;
        }

        return previewAsset.type === 'image' ? (previewAsset.url ?? null) : null;
    });

    let thumbnailCount = $derived.by(() => {
        if (!width) return 1;

        return Math.max(1, Math.min(MAX_THUMBNAILS, Math.ceil(width / THUMBNAIL_TILE_WIDTH)));
    });

    $effect(() => {
        const previewKey = [scene.thumbnail_url ?? '', previewAsset?.thumbnail_url ?? '', previewAsset?.url ?? ''].join('|');

        if (previewKey !== lastPreviewKey) {
            lastPreviewKey = previewKey;
            imageLoadFailed = false;
        }
    });

    $effect(() => {
        const asset = previewAsset;
        const layer = visualLayer;
        const assetUrl = asset?.url;
        const count = thumbnailCount;

        if (!asset || !layer || layer.type !== 'video' || !assetUrl) {
            return;
        }

        let cancelled = false;
        isGenerating = true;

        const trimStartMs = layer.trim_start_ms ?? 0;
        const usableDurationMs = Math.max(1, scene.duration_ms);
        const timestamps = Array.from({ length: count }, (_, index) => {
            const progress = (index + 0.5) / count;

            return (trimStartMs + usableDurationMs * progress) / 1000;
        });

        // Lazy-load mediabunny so the heavy media library stays out of the initial bundle
        void import('@/lib/editor/mediabunny')
            .then(({ createVideoFrameBlobs }) => createVideoFrameBlobs(assetUrl, timestamps, 180))
            .then((blobs) => {
                if (cancelled) return;

                const urls = blobs.filter((blob): blob is Blob => Boolean(blob)).map((blob) => URL.createObjectURL(blob));

                for (const url of generatedThumbnailUrls) {
                    URL.revokeObjectURL(url);
                }

                generatedThumbnailUrls = urls;
            })
            .catch((error) => {
                console.warn('Unable to generate scene thumbnails:', error);
            })
            .finally(() => {
                if (!cancelled) {
                    isGenerating = false;
                }
            });

        return () => {
            cancelled = true;
        };
    });

    $effect(() => {
        return () => {
            for (const url of generatedThumbnailUrls) {
                URL.revokeObjectURL(url);
            }
        };
    });
</script>

{#if generatedThumbnailUrls.length > 0}
    <div class="flex h-full w-full overflow-hidden" aria-label={alt}>
        {#each generatedThumbnailUrls as thumbnailUrl, thumbnailIndex (thumbnailUrl)}
            <img
                src={thumbnailUrl}
                alt={`${alt} thumbnail ${thumbnailIndex + 1}`}
                class="h-full min-w-0 flex-1 object-cover"
                onerror={() => {
                    imageLoadFailed = true;
                }}
            />
        {/each}
    </div>
{:else if fallbackPreviewUrl}
    <img
        src={fallbackPreviewUrl}
        {alt}
        class="h-full w-full object-contain"
        onerror={() => {
            imageLoadFailed = true;
        }}
    />
{:else if scene.layers.length === 0}
    <div class="flex h-full items-center justify-center">
        <Video class="h-6 w-6 text-muted-foreground/30" />
    </div>
{:else}
    <div class="flex h-full items-center justify-center">
        {#if isGenerating}
            <div class="h-6 w-6 animate-pulse rounded bg-white/20"></div>
        {:else}
            <ImageIcon class="h-6 w-6 text-muted-foreground/30" />
        {/if}
    </div>
{/if}
