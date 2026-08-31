<script lang="ts">
    import { onDestroy } from 'svelte';
    import { Film, Type } from 'lucide-svelte';

    import { projectStore, timelineStore } from '@/lib/editor';
    import { historyStore } from '@/lib/editor/history.svelte';
    import { getCachedFramePreviewUrl } from '@/lib/editor/media-cache';
    import { collectSnapPoints, applySnap } from '@/lib/editor/snapping';
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
    let snapPoints: number[] = [];

    function captureSnapPoints() {
        snapPoints = collectSnapPoints(projectStore.project, {
            excludeVideoClipId: clip.id,
            playheadMs: timelineStore.currentTimeMs,
        });
    }

    function getAssetName(): string {
        const assets = projectStore.project?.assets ?? [];
        if (clip.type === 'text') {
            return clip.text || 'Text Overlay';
        }

        const asset = assets.find((a) => a.id === clip.asset_id);
        return asset?.name ?? 'Video';
    }

    function getThumbnailUrl(): string | null {
        if (clip.type === 'text') {
            return null;
        }

        const assets = projectStore.project?.assets ?? [];
        const asset = assets.find((a) => a.id === clip.asset_id);
        return asset?.thumbnail_url ?? null;
    }

    function getVideoAssetUrl(): string | null {
        if (clip.type === 'text') {
            return null;
        }

        const assets = projectStore.project?.assets ?? [];
        const asset = assets.find((a) => a.id === clip.asset_id);
        return asset?.url ?? null;
    }

    function handleMouseDown(e: MouseEvent) {
        if (e.button !== 0 || isResizing) return;
        e.stopPropagation();

        historyStore.beginBatch();
        isDragging = true;
        dragStartX = e.clientX;
        dragStartMs = clip.start_ms;
        captureSnapPoints();

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }

    function handleResizeStart(side: 'left' | 'right', e: MouseEvent) {
        if (side !== 'left' && side !== 'right') return;
        e.stopPropagation();
        e.preventDefault();

        historyStore.beginBatch();
        isResizing = side;
        dragStartX = e.clientX;
        dragStartMs = clip.start_ms;
        dragStartDuration = clip.duration_ms;
        captureSnapPoints();

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }

    function handleMouseMove(e: MouseEvent) {
        const deltaX = e.clientX - dragStartX;
        const deltaMs = deltaX / pixelsPerMs;
        const snapping = !e.altKey;

        if (isDragging) {
            let newStartMs = Math.max(0, dragStartMs + deltaMs);
            if (snapping) {
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
        } else if (isResizing === 'left') {
            let newStartMs = Math.max(0, dragStartMs + deltaMs);
            if (snapping) {
                const snap = applySnap(newStartMs, snapPoints, pixelsPerMs);
                if (snap.snapped) {
                    newStartMs = snap.ms;
                }
            }
            const newDuration = Math.max(100, dragStartDuration - (newStartMs - dragStartMs));
            onUpdate?.({
                start_ms: Math.round(newStartMs),
                duration_ms: Math.round(newDuration),
            });
        } else if (isResizing === 'right') {
            let newEndMs = dragStartMs + dragStartDuration + deltaMs;
            if (snapping) {
                const snap = applySnap(newEndMs, snapPoints, pixelsPerMs);
                if (snap.snapped) {
                    newEndMs = snap.ms;
                }
            }
            const newDuration = Math.max(100, newEndMs - dragStartMs);
            onUpdate?.({ duration_ms: Math.round(newDuration) });
        }
    }

    function handleMouseUp() {
        historyStore.endBatch();
        isDragging = false;
        isResizing = null;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    }

    onDestroy(() => {
        if (isDragging || isResizing) {
            historyStore.endBatch();
        }
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    });

    let thumbnailUrl = $derived(getThumbnailUrl());

    // Filmstrip: sample evenly-spaced frames across the clip's media range.
    let clipWidthPx = $derived(clip.duration_ms * pixelsPerMs);
    let frameCount = $derived(
        clip.type === 'text' ? 0 : Math.min(10, Math.max(1, Math.floor(clipWidthPx / 80))),
    );

    let filmstripUrls = $state<(string | null)[]>([]);
    let lastFilmstripKey = '';

    // Load frames lazily. Skipped while dragging/resizing (recomputes on release)
    // and keyed by asset url + frame count + trim + duration to avoid refetching
    // on every reactive tick.
    $effect(() => {
        if (isDragging || isResizing) return;
        if (clip.type === 'text') {
            filmstripUrls = [];
            return;
        }

        const url = getVideoAssetUrl();
        const n = frameCount;
        const trim = clip.trim_start_ms ?? 0;
        const duration = clip.duration_ms;

        if (!url || n <= 0) {
            filmstripUrls = [];
            lastFilmstripKey = '';
            return;
        }

        const key = `${url}:${n}:${trim}:${duration}`;
        if (key === lastFilmstripKey) return;
        lastFilmstripKey = key;

        Promise.all(
            Array.from({ length: n }, (_, i) => {
                const timeSec = (trim + ((i + 0.5) / n) * duration) / 1000;
                return getCachedFramePreviewUrl(url, timeSec).catch(() => null);
            }),
        ).then((urls) => {
            if (lastFilmstripKey === key) {
                filmstripUrls = urls;
            }
        });
    });
</script>

<div
    class={cn(
        'group absolute top-1 h-[calc(100%-8px)] rounded cursor-move overflow-hidden',
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
    {#if clip.type === 'text'}
        <div class="absolute inset-0 bg-amber-500/85"></div>
    {:else if filmstripUrls.length > 0}
        <div class="absolute inset-0 flex bg-violet-600/80">
            {#each filmstripUrls as frameUrl, i (i)}
                <div
                    class="h-full min-w-0 flex-1 border-r border-black/20 bg-cover bg-center last:border-r-0"
                    style:background-image={frameUrl ? `url(${frameUrl})` : undefined}
                ></div>
            {/each}
        </div>
        <div class="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent"></div>
    {:else if thumbnailUrl}
        <img
            src={thumbnailUrl}
            alt=""
            class="absolute inset-0 h-full w-full object-cover"
        />
        <div class="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent"></div>
    {:else}
        <div class="absolute inset-0 bg-violet-600/80"></div>
    {/if}

    <div class="relative flex h-full items-center gap-1 px-2 overflow-hidden">
        {#if clip.type === 'text'}
            <Type class="h-3 w-3 flex-shrink-0 text-white" />
        {:else}
            <Film class="h-3 w-3 flex-shrink-0 text-white" />
        {/if}
        <span class="text-xs text-white truncate font-medium drop-shadow">{getAssetName()}</span>
    </div>

    <button
        type="button"
        class="absolute top-0 -left-1 bottom-0 z-10 flex w-3 cursor-ew-resize items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
        aria-label="Resize clip left"
        onmousedown={(event) => handleResizeStart('left', event)}
    >
        <span class="h-8 w-1 rounded-full bg-white/90 shadow"></span>
    </button>
    <button
        type="button"
        class="absolute top-0 -right-1 bottom-0 z-10 flex w-3 cursor-ew-resize items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
        aria-label="Resize clip right"
        onmousedown={(event) => handleResizeStart('right', event)}
    >
        <span class="h-8 w-1 rounded-full bg-white/90 shadow"></span>
    </button>
</div>
