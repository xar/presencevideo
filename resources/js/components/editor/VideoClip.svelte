<script lang="ts">
    import { Film } from 'lucide-svelte';
    import { projectStore } from '@/lib/editor';
    import { cn } from '@/lib/utils';
    import type { VideoClip as VideoClipType } from '@/types';

    let {
        clip,
        pixelsPerMs,
        isSelected = false,
        onclick,
        onUpdate,
    }: {
        clip: VideoClipType;
        pixelsPerMs: number;
        isSelected?: boolean;
        onclick?: () => void;
        onUpdate?: (updates: Partial<VideoClipType>) => void;
    } = $props();

    let isDragging = $state(false);
    let isResizing = $state<'left' | 'right' | null>(null);
    let dragStartX = $state(0);
    let dragStartMs = $state(0);
    let dragStartDuration = $state(0);

    function getAssetName(): string {
        const assets = projectStore.project?.assets ?? [];
        const asset = assets.find((a) => a.id === clip.asset_id);
        return asset?.name ?? 'Video';
    }

    function getThumbnailUrl(): string | null {
        const assets = projectStore.project?.assets ?? [];
        const asset = assets.find((a) => a.id === clip.asset_id);
        return asset?.thumbnail_url ?? null;
    }

    function handleMouseDown(e: MouseEvent) {
        if (e.button !== 0 || isResizing) return;
        e.stopPropagation();

        isDragging = true;
        dragStartX = e.clientX;
        dragStartMs = clip.start_ms;

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }

    function handleResizeStart(side: 'left' | 'right', e: MouseEvent) {
        e.stopPropagation();
        e.preventDefault();

        isResizing = side;
        dragStartX = e.clientX;
        dragStartMs = clip.start_ms;
        dragStartDuration = clip.duration_ms;

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }

    function handleMouseMove(e: MouseEvent) {
        const deltaX = e.clientX - dragStartX;
        const deltaMs = deltaX / pixelsPerMs;

        if (isDragging) {
            const newStartMs = Math.max(0, dragStartMs + deltaMs);
            onUpdate?.({ start_ms: Math.round(newStartMs) });
        } else if (isResizing === 'left') {
            const newStartMs = Math.max(0, dragStartMs + deltaMs);
            const newDuration = Math.max(100, dragStartDuration - deltaMs);
            onUpdate?.({
                start_ms: Math.round(newStartMs),
                duration_ms: Math.round(newDuration),
            });
        } else if (isResizing === 'right') {
            const newDuration = Math.max(100, dragStartDuration + deltaMs);
            onUpdate?.({ duration_ms: Math.round(newDuration) });
        }
    }

    function handleMouseUp() {
        isDragging = false;
        isResizing = null;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    }

    let thumbnailUrl = $derived(getThumbnailUrl());
</script>

<div
    class={cn(
        'absolute top-1 h-[calc(100%-8px)] rounded cursor-move overflow-hidden',
        isSelected
            ? 'ring-2 ring-primary'
            : 'ring-1 ring-border hover:ring-primary/50'
    )}
    style:left="{clip.start_ms * pixelsPerMs}px"
    style:width="{clip.duration_ms * pixelsPerMs}px"
    onmousedown={handleMouseDown}
    onclick={onclick}
    onkeydown={() => {}}
    role="button"
    tabindex="0"
>
    {#if thumbnailUrl}
        <img
            src={thumbnailUrl}
            alt=""
            class="absolute inset-0 h-full w-full object-cover"
        />
        <div class="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent" />
    {:else}
        <div class="absolute inset-0 bg-violet-600/80" />
    {/if}

    <div class="relative flex h-full items-center gap-1 px-2 overflow-hidden">
        <Film class="h-3 w-3 flex-shrink-0 text-white" />
        <span class="text-xs text-white truncate font-medium drop-shadow">{getAssetName()}</span>
    </div>

    {#if isSelected}
        <div
            class="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-white/50 hover:bg-white/70"
            onmousedown={(e) => handleResizeStart('left', e)}
        />
        <div
            class="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-white/50 hover:bg-white/70"
            onmousedown={(e) => handleResizeStart('right', e)}
        />
    {/if}
</div>
