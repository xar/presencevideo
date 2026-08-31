<script lang="ts">
    import { onDestroy } from 'svelte';
    import { Music } from 'lucide-svelte';
    import AudioWaveform from '@/components/editor/AudioWaveform.svelte';
    import { projectStore, timelineStore } from '@/lib/editor';
    import { historyStore } from '@/lib/editor/history.svelte';
    import { collectSnapPoints, applySnap } from '@/lib/editor/snapping';
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

    let isResizingLeft = $state(false);
    let isResizingRight = $state(false);
    let resizeStartX = $state(0);
    let resizeStartMs = $state(0);
    let resizeDurationMs = $state(0);
    let snapPoints: number[] = [];

    function captureSnapPoints() {
        snapPoints = collectSnapPoints(projectStore.project, {
            excludeAudioClipId: clip.id,
            playheadMs: timelineStore.currentTimeMs,
        });
    }

    function getAssetName(): string {
        const assets = projectStore.project?.assets ?? [];
        const asset = assets.find((a) => a.id === clip.asset_id);
        return asset?.name ?? 'Audio';
    }

    function getAssetUrl(): string | null {
        const assets = projectStore.project?.assets ?? [];
        const asset = assets.find((a) => a.id === clip.asset_id);
        return asset?.url ?? null;
    }


    function handleMouseDown(e: MouseEvent) {
        if (e.button !== 0) return;
        e.stopPropagation();

        historyStore.beginBatch();
        isDragging = true;
        dragStartX = e.clientX;
        dragStartMs = clip.start_ms;
        captureSnapPoints();

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }

    function handleMouseMove(e: MouseEvent) {
        if (!isDragging) return;

        const deltaX = e.clientX - dragStartX;
        const deltaMs = deltaX / pixelsPerMs;
        let newStartMs = Math.max(0, dragStartMs + deltaMs);

        if (!e.altKey) {
            const startSnap = applySnap(newStartMs, snapPoints, pixelsPerMs);
            if (startSnap.snapped) {
                newStartMs = startSnap.ms;
            } else {
                const endSnap = applySnap(newStartMs + clip.duration_ms, snapPoints, pixelsPerMs);
                if (endSnap.snapped) {
                    newStartMs = Math.max(0, endSnap.ms - clip.duration_ms);
                }
            }
        }

        onUpdate?.({ start_ms: Math.round(newStartMs) });
    }

    function handleMouseUp() {
        isDragging = false;
        historyStore.endBatch();
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    }

    // Left trim handle — adjusts start_ms and duration_ms together
    function handleTrimLeftDown(e: MouseEvent) {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();

        historyStore.beginBatch();
        isResizingLeft = true;
        resizeStartX = e.clientX;
        resizeStartMs = clip.start_ms;
        resizeDurationMs = clip.duration_ms;
        captureSnapPoints();

        window.addEventListener('mousemove', handleTrimLeftMove);
        window.addEventListener('mouseup', handleTrimLeftUp);
    }

    function handleTrimLeftMove(e: MouseEvent) {
        if (!isResizingLeft) return;

        const deltaX = e.clientX - resizeStartX;
        const deltaMs = deltaX / pixelsPerMs;
        let newStart = Math.max(0, resizeStartMs + deltaMs);

        if (!e.altKey) {
            const snap = applySnap(newStart, snapPoints, pixelsPerMs);
            if (snap.snapped) {
                newStart = snap.ms;
            }
        }

        const newDuration = resizeDurationMs - (newStart - resizeStartMs);

        if (newDuration >= 100) {
            onUpdate?.({
                start_ms: Math.round(newStart),
                duration_ms: Math.round(newDuration),
            });
        }
    }

    function handleTrimLeftUp() {
        isResizingLeft = false;
        historyStore.endBatch();
        window.removeEventListener('mousemove', handleTrimLeftMove);
        window.removeEventListener('mouseup', handleTrimLeftUp);
    }

    // Right trim handle — adjusts duration_ms
    function handleTrimRightDown(e: MouseEvent) {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();

        historyStore.beginBatch();
        isResizingRight = true;
        resizeStartX = e.clientX;
        resizeStartMs = clip.start_ms;
        resizeDurationMs = clip.duration_ms;
        captureSnapPoints();

        window.addEventListener('mousemove', handleTrimRightMove);
        window.addEventListener('mouseup', handleTrimRightUp);
    }

    function handleTrimRightMove(e: MouseEvent) {
        if (!isResizingRight) return;

        const deltaX = e.clientX - resizeStartX;
        const deltaMs = deltaX / pixelsPerMs;
        let newEndMs = resizeStartMs + resizeDurationMs + deltaMs;

        if (!e.altKey) {
            const snap = applySnap(newEndMs, snapPoints, pixelsPerMs);
            if (snap.snapped) {
                newEndMs = snap.ms;
            }
        }

        const newDuration = Math.max(100, newEndMs - resizeStartMs);

        onUpdate?.({ duration_ms: Math.round(newDuration) });
    }

    function handleTrimRightUp() {
        isResizingRight = false;
        historyStore.endBatch();
        window.removeEventListener('mousemove', handleTrimRightMove);
        window.removeEventListener('mouseup', handleTrimRightUp);
    }

    onDestroy(() => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('mousemove', handleTrimLeftMove);
        window.removeEventListener('mouseup', handleTrimLeftUp);
        window.removeEventListener('mousemove', handleTrimRightMove);
        window.removeEventListener('mouseup', handleTrimRightUp);
    });
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
    <AudioWaveform url={getAssetUrl()} />

    <div class="relative flex h-full items-center gap-1 px-2 overflow-hidden">
        <Music class="h-3 w-3 flex-shrink-0 text-primary-foreground drop-shadow" />
        <span class="text-xs text-primary-foreground truncate drop-shadow">{getAssetName()}</span>
    </div>

    {#if isSelected}
        <div
            class="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize bg-white/50 rounded-l"
            onmousedown={handleTrimLeftDown}
            role="presentation"
        ></div>
        <div
            class="absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize bg-white/50 rounded-r"
            onmousedown={handleTrimRightDown}
            role="presentation"
        ></div>
    {/if}
</div>
