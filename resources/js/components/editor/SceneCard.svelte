<script lang="ts">
    import { Video, Play } from 'lucide-svelte';
    import { cn } from '@/lib/utils';
    import type { Scene, Asset } from '@/types';

    let {
        scene,
        index,
        assets = [],
        isSelected = false,
        isPlaying = false,
        width,
        minWidth = 48,
        onclick,
        onResizeStart,
    }: {
        scene: Scene;
        index: number;
        assets?: Asset[];
        isSelected?: boolean;
        isPlaying?: boolean;
        width?: number;
        minWidth?: number;
        onclick?: () => void;
        onResizeStart?: (e: MouseEvent) => void;
    } = $props();

    function formatDuration(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    // Find the first image/video layer's asset URL for preview
    let previewUrl = $derived.by(() => {
        // First check if scene has explicit thumbnail
        if (scene.thumbnail_url) return scene.thumbnail_url;

        // Find first visual layer (image or video)
        const visualLayer = scene.layers.find(
            (l) => l.type === 'image' || l.type === 'video'
        );
        if (!visualLayer || !('asset_id' in visualLayer)) return null;

        // Find the asset
        const asset = assets.find((a) => a.id === visualLayer.asset_id);
        if (!asset) return null;

        // Prefer thumbnail for videos, direct URL for images
        return asset.thumbnail_url ?? asset.url ?? null;
    });
</script>

<button
    type="button"
    class={cn(
        'group relative flex h-16 flex-col items-center justify-center rounded-md border bg-background transition-all',
        !width && 'w-24',
        isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/50',
        isPlaying && 'ring-2 ring-green-500/50 border-green-500'
    )}
    style:width={width ? `${width}px` : undefined}
    style:min-width={minWidth ? `${minWidth}px` : undefined}
    {onclick}
>
    {#if previewUrl}
        <img
            src={previewUrl}
            alt={scene.name ?? `Scene ${index + 1}`}
            class="absolute inset-0 h-full w-full rounded-md object-cover"
        />
    {:else}
        <div
            class="absolute inset-0 rounded-md"
            style:background-color={scene.background_color ?? '#000'}
        >
            {#if scene.layers.length === 0}
                <div class="flex h-full items-center justify-center">
                    <Video class="h-6 w-6 text-muted-foreground/30" />
                </div>
            {/if}
        </div>
    {/if}

    {#if isPlaying}
        <div class="absolute inset-0 flex items-center justify-center bg-black/30 rounded-md">
            <Play class="h-6 w-6 text-white fill-white" />
        </div>
    {/if}

    <div class="absolute inset-x-0 bottom-0 rounded-b-md bg-black/60 px-1 py-0.5">
        <div class="flex items-center justify-between text-[10px] text-white">
            <span class="truncate">{scene.name ?? `Scene ${index + 1}`}</span>
            <span class="text-white/70">{formatDuration(scene.duration_ms)}</span>
        </div>
    </div>

    <div class="absolute -top-1 -left-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
        {index + 1}
    </div>

    {#if isSelected && onResizeStart}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            class="absolute top-0 -right-1 bottom-0 w-3 cursor-ew-resize z-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            onmousedown={(e) => { e.stopPropagation(); onResizeStart(e); }}
        >
            <div class="h-8 w-1.5 rounded-full bg-primary"></div>
        </div>
    {/if}
</button>
