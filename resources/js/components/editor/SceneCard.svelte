<script lang="ts">
    import { Play } from 'lucide-svelte';
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
        /** Live duration while resizing; falls back to the stored duration. */
        durationMs,
        /** This card is the one being dragged to a new position. */
        isDragging = false,
        /** Horizontal offset (px) applied while the card is dragged. */
        dragOffsetX = 0,
        /** Another card is being dragged, so this one must not react to hover. */
        isDragActive = false,
        /** This card's right edge is currently being resized. */
        isResizing = false,
        /** Snap indicator for the current resize gesture. */
        isSnapped = false,
        onPointerDown,
        onResizePointerDown,
        onContextMenu,
        onSelect,
    }: {
        scene: Scene;
        index: number;
        assets?: Asset[];
        isSelected?: boolean;
        isPlaying?: boolean;
        width?: number;
        minWidth?: number;
        durationMs?: number;
        isDragging?: boolean;
        dragOffsetX?: number;
        isDragActive?: boolean;
        isResizing?: boolean;
        isSnapped?: boolean;
        onPointerDown?: (e: PointerEvent) => void;
        onResizePointerDown?: (e: PointerEvent) => void;
        onContextMenu?: (e: MouseEvent) => void;
        onSelect?: () => void;
    } = $props();

    let effectiveDuration = $derived(durationMs ?? scene.duration_ms);
    let durationLabel = $derived(`${(effectiveDuration / 1000).toFixed(1)}s`);
    let label = $derived(scene.name ?? `Scene ${index + 1}`);
</script>

<div
    role="button"
    tabindex="0"
    aria-label="{label}, {durationLabel}"
    aria-pressed={isSelected}
    class={cn(
        'group relative flex h-16 flex-col items-center justify-center rounded-md border bg-background select-none touch-none',
        !width && 'w-24',
        isDragging
            ? 'z-30 cursor-grabbing opacity-80 shadow-xl ring-2 ring-primary scale-[0.97]'
            : 'cursor-grab transition-[border-color,box-shadow,transform]',
        isDragActive && !isDragging && 'pointer-events-none',
        isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border',
        !isDragActive && !isSelected && 'hover:border-primary/60 hover:brightness-110',
        isPlaying && 'ring-2 ring-green-500/50 border-green-500',
        isResizing && 'ring-2 ring-primary'
    )}
    style:width={width ? `${width}px` : undefined}
    style:min-width={minWidth ? `${minWidth}px` : undefined}
    style:transform={isDragging ? `translateX(${dragOffsetX}px)` : undefined}
    onpointerdown={onPointerDown}
    oncontextmenu={onContextMenu}
    onkeydown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect?.();
        }
    }}
>
    <div
        class="absolute inset-0 rounded-md overflow-hidden"
        style:background-color={scene.background_color ?? '#18181b'}
    >
        <SceneThumbnail {scene} {assets} {width} alt={label} />
    </div>

    {#if isPlaying}
        <div class="absolute inset-0 flex items-center justify-center bg-black/30 rounded-md">
            <Play class="h-6 w-6 text-white fill-white" />
        </div>
    {/if}

    <div class="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-md bg-black/65 px-1 py-0.5">
        <div class="flex items-center justify-between gap-1 text-[10px] text-white">
            <span class="truncate">{label}</span>
            <span class="shrink-0 tabular-nums font-medium text-white/85">{durationLabel}</span>
        </div>
    </div>

    <div class="pointer-events-none absolute -top-1 -left-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
        {index + 1}
    </div>

    {#if isResizing}
        <div
            class="pointer-events-none absolute -top-6 right-0 z-40 translate-x-1/2 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-primary-foreground shadow
            {isSnapped ? 'ring-2 ring-primary/40' : ''}"
        >
            {durationLabel}{isSnapped ? ' ·' : ''}
        </div>
    {/if}

    {#if onResizePointerDown}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            class="absolute top-0 -right-1.5 bottom-0 z-20 flex w-3 cursor-ew-resize items-center justify-center touch-none"
            title="Drag to change scene duration"
            onpointerdown={(e) => {
                e.stopPropagation();
                onResizePointerDown(e);
            }}
        >
            <div
                class="h-8 w-1.5 rounded-full transition-opacity
                {isResizing ? 'bg-primary opacity-100' : 'bg-primary/80 opacity-0 group-hover:opacity-100'}"
            ></div>
        </div>
    {/if}
</div>
