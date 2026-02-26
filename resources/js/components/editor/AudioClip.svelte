<script lang="ts">
    import { Music } from 'lucide-svelte';
    import { projectStore } from '@/lib/editor';
    import { cn } from '@/lib/utils';
    import type { AudioClip as AudioClipType } from '@/types';

    let {
        clip,
        pixelsPerMs,
        isSelected = false,
        onclick,
        onUpdate,
    }: {
        clip: AudioClipType;
        pixelsPerMs: number;
        isSelected?: boolean;
        onclick?: () => void;
        onUpdate?: (updates: Partial<AudioClipType>) => void;
    } = $props();

    let isDragging = $state(false);
    let dragStartX = $state(0);
    let dragStartMs = $state(0);

    function getAssetName(): string {
        const assets = projectStore.project?.assets ?? [];
        const asset = assets.find((a) => a.id === clip.asset_id);
        return asset?.name ?? 'Audio';
    }

    function handleMouseDown(e: MouseEvent) {
        if (e.button !== 0) return;
        e.stopPropagation();

        isDragging = true;
        dragStartX = e.clientX;
        dragStartMs = clip.start_ms;

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }

    function handleMouseMove(e: MouseEvent) {
        if (!isDragging) return;

        const deltaX = e.clientX - dragStartX;
        const deltaMs = deltaX / pixelsPerMs;
        const newStartMs = Math.max(0, dragStartMs + deltaMs);

        onUpdate?.({ start_ms: Math.round(newStartMs) });
    }

    function handleMouseUp() {
        isDragging = false;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    }
</script>

<div
    class={cn(
        'absolute top-1 h-[calc(100%-8px)] rounded cursor-move',
        isSelected
            ? 'bg-primary/80 ring-2 ring-primary'
            : 'bg-primary/60 hover:bg-primary/70'
    )}
    style:left="{clip.start_ms * pixelsPerMs}px"
    style:width="{clip.duration_ms * pixelsPerMs}px"
    onmousedown={handleMouseDown}
    onclick={onclick}
    onkeydown={() => {}}
    role="button"
    tabindex="0"
>
    <div class="flex h-full items-center gap-1 px-2 overflow-hidden">
        <Music class="h-3 w-3 flex-shrink-0 text-primary-foreground" />
        <span class="text-xs text-primary-foreground truncate">{getAssetName()}</span>
    </div>

    {#if isSelected}
        <div class="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize bg-white/50 rounded-l" />
        <div class="absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize bg-white/50 rounded-r" />
    {/if}
</div>
