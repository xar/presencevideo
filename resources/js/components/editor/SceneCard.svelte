<script lang="ts">
    import { Play } from 'lucide-svelte';
    import { formatClockTime } from '@/lib/editor/formatting';
    import { cn } from '@/lib/utils';
    import type { Scene, Asset } from '@/types';
    import SceneThumbnail from './SceneThumbnail.svelte';

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
    <div
        class="absolute inset-0 rounded-md overflow-hidden"
        style:background-color={scene.background_color ?? '#18181b'}
    >
        <SceneThumbnail {scene} {assets} {width} alt={scene.name ?? `Scene ${index + 1}`} />
    </div>

    {#if isPlaying}
        <div class="absolute inset-0 flex items-center justify-center bg-black/30 rounded-md">
            <Play class="h-6 w-6 text-white fill-white" />
        </div>
    {/if}

    <div class="absolute inset-x-0 bottom-0 rounded-b-md bg-black/60 px-1 py-0.5">
        <div class="flex items-center justify-between text-[10px] text-white">
            <span class="truncate">{scene.name ?? `Scene ${index + 1}`}</span>
            <span class="text-white/70">{formatClockTime(scene.duration_ms)}</span>
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
