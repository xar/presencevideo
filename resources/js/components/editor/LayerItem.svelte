<script lang="ts">
    import type { Layer, TextLayer, ImageLayer, VideoLayer } from '@/types';
    import { cn } from '@/lib/utils';
    import { projectStore } from '@/lib/editor';

    let {
        layer,
        scale = 1,
        isSelected = false,
        onclick,
        onUpdate,
    }: {
        layer: Layer;
        scale?: number;
        isSelected?: boolean;
        onclick?: (e: MouseEvent) => void;
        onUpdate?: (updates: Partial<Layer>) => void;
    } = $props();

    let isDragging = $state(false);
    let dragStart = $state({ x: 0, y: 0, layerX: 0, layerY: 0 });

    function handleMouseDown(e: MouseEvent) {
        if (e.button !== 0) return;
        e.stopPropagation();

        isDragging = true;
        dragStart = {
            x: e.clientX,
            y: e.clientY,
            layerX: layer.x,
            layerY: layer.y,
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }

    function handleMouseMove(e: MouseEvent) {
        if (!isDragging) return;

        const deltaX = (e.clientX - dragStart.x) / scale;
        const deltaY = (e.clientY - dragStart.y) / scale;

        onUpdate?.({
            x: Math.round(dragStart.layerX + deltaX),
            y: Math.round(dragStart.layerY + deltaY),
        });
    }

    function handleMouseUp() {
        isDragging = false;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    }

    function getAssetUrl(assetId: number): string | null {
        const assets = projectStore.project?.assets ?? [];
        const asset = assets.find((a) => a.id === assetId);
        return asset?.url ?? null;
    }
</script>

<div
    class={cn(
        'absolute cursor-move',
        isSelected && 'ring-2 ring-primary ring-offset-1'
    )}
    style:left="{layer.x * scale}px"
    style:top="{layer.y * scale}px"
    style:width="{layer.width * scale}px"
    style:height="{layer.height * scale}px"
    style:transform="rotate({layer.rotation ?? 0}deg)"
    style:opacity={layer.opacity ?? 1}
    onmousedown={handleMouseDown}
    onclick={onclick}
    onkeydown={() => {}}
    role="button"
    tabindex="0"
>
    {#if layer.type === 'image'}
        {@const imageLayer = layer as ImageLayer}
        {@const url = getAssetUrl(imageLayer.asset_id)}
        {#if url}
            <img
                src={url}
                alt="Layer"
                class="h-full w-full object-cover pointer-events-none"
                draggable="false"
            />
        {:else}
            <div class="h-full w-full bg-muted flex items-center justify-center">
                <span class="text-xs text-muted-foreground">Image</span>
            </div>
        {/if}
    {:else if layer.type === 'video'}
        {@const videoLayer = layer as VideoLayer}
        {@const url = getAssetUrl(videoLayer.asset_id)}
        {#if url}
            <video
                src={url}
                class="h-full w-full object-cover pointer-events-none"
                muted
            />
        {:else}
            <div class="h-full w-full bg-muted flex items-center justify-center">
                <span class="text-xs text-muted-foreground">Video</span>
            </div>
        {/if}
    {:else if layer.type === 'text'}
        {@const textLayer = layer as TextLayer}
        <div
            class="flex h-full w-full items-center justify-center p-2"
            style:font-family={textLayer.font_family ?? 'system-ui'}
            style:font-size="{(textLayer.font_size ?? 48) * scale}px"
            style:color={textLayer.font_color ?? '#ffffff'}
            style:font-weight={textLayer.font_weight ?? 'normal'}
            style:text-align={textLayer.text_align ?? 'center'}
            style:background-color={textLayer.background_color ?? 'transparent'}
            style:padding="{(textLayer.padding ?? 0) * scale}px"
        >
            {textLayer.text}
        </div>
    {/if}

    {#if isSelected}
        <div class="absolute -top-1 -left-1 h-3 w-3 rounded-full bg-primary border-2 border-background cursor-nwse-resize" />
        <div class="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-primary border-2 border-background cursor-nesw-resize" />
        <div class="absolute -bottom-1 -left-1 h-3 w-3 rounded-full bg-primary border-2 border-background cursor-nesw-resize" />
        <div class="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-primary border-2 border-background cursor-nwse-resize" />
    {/if}
</div>
