<script lang="ts">
    import { onDestroy } from 'svelte';
    import { projectStore, timelineStore, selectionStore } from '@/lib/editor';
    import { historyStore } from '@/lib/editor/history.svelte';
    import { useDragResize } from '@/lib/editor/useDragResize.svelte';
    import { cn } from '@/lib/utils';
    import type { VideoClip } from '@/types';

    let {
        clip,
        trackId,
        scale = 1,
        isSelected = false,
        onclick,
        onUpdate,
    }: {
        clip: VideoClip;
        trackId: string;
        scale?: number;
        isSelected?: boolean;
        onclick?: (e: MouseEvent) => void;
        onUpdate?: (updates: Partial<VideoClip>) => void;
    } = $props();

    let videoEl: HTMLVideoElement | undefined = $state();
    let isPlaying = $derived(timelineStore.isPlaying);
    let currentTimeMs = $derived(timelineStore.currentTimeMs);

    // Calculate time within this clip
    let clipTimeMs = $derived.by(() => {
        const trimStart = clip.trim_start_ms ?? 0;
        const timeInClip = currentTimeMs - clip.start_ms;
        return Math.max(0, timeInClip + trimStart);
    });

    // Sync video playback with timeline
    $effect(() => {
        if (!videoEl) return;

        const playing = isPlaying;
        const targetTime = clipTimeMs / 1000;

        if (!playing) {
            if (Math.abs(videoEl.currentTime - targetTime) > 0.05) {
                videoEl.currentTime = targetTime;
            }
            if (!videoEl.paused) {
                videoEl.pause();
            }
            return;
        }

        if (Math.abs(videoEl.currentTime - targetTime) > 0.3) {
            videoEl.currentTime = targetTime;
        }

        if (videoEl.paused) {
            videoEl.play().catch((err) => {
                console.warn('Video play failed:', err);
            });
        }
    });

    const dragResize = useDragResize({
        getPosition: () => ({ x: clip.x, y: clip.y, width: clip.width, height: clip.height }),
        onUpdate: (updates) => onUpdate?.(updates),
        scale: () => scale,
        minWidth: 40,
        minHeight: 40,
    });

    function handleMouseDown(e: MouseEvent) {
        historyStore.beginBatch();
        dragResize.handleMouseDown(e);
        const onUp = () => {
            historyStore.endBatch();
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mouseup', onUp);
    }

    function handleResizeStart(corner: string, e: MouseEvent) {
        historyStore.beginBatch();
        dragResize.handleResizeStart(corner, e);
        const onUp = () => {
            historyStore.endBatch();
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mouseup', onUp);
    }

    function getAssetUrl(): string | null {
        const assets = projectStore.project?.assets ?? [];
        const asset = assets.find((a) => a.id === clip.asset_id);
        return asset?.url ?? null;
    }

    let assetUrl = $derived(getAssetUrl());

    onDestroy(() => {
        dragResize.cleanup();
    });
</script>

<div
    class={cn(
        'absolute cursor-move rounded overflow-hidden shadow-lg',
        isSelected && 'ring-2 ring-primary ring-offset-1'
    )}
    style:left="{clip.x * scale}px"
    style:top="{clip.y * scale}px"
    style:width="{clip.width * scale}px"
    style:height="{clip.height * scale}px"
    style:opacity={clip.opacity ?? 1}
    style:z-index={clip.z_index + 100}
    onmousedown={handleMouseDown}
    onclick={onclick}
    onkeydown={() => {}}
    role="button"
    tabindex="0"
>
    {#if assetUrl}
        <video
            bind:this={videoEl}
            src={assetUrl}
            class="h-full w-full object-cover pointer-events-none"
            muted
            playsinline
            preload="auto"
        ></video>
    {:else}
        <div class="h-full w-full bg-muted flex items-center justify-center">
            <span class="text-xs text-muted-foreground">Video</span>
        </div>
    {/if}

    {#if isSelected}
        <!-- Resize handles -->
        <div
            class="absolute -top-1.5 -left-1.5 h-3 w-3 rounded-full bg-primary border-2 border-background cursor-nwse-resize z-10"
            onmousedown={(e) => handleResizeStart('top-left', e)}
        ></div>
        <div
            class="absolute -top-1.5 -right-1.5 h-3 w-3 rounded-full bg-primary border-2 border-background cursor-nesw-resize z-10"
            onmousedown={(e) => handleResizeStart('top-right', e)}
        ></div>
        <div
            class="absolute -bottom-1.5 -left-1.5 h-3 w-3 rounded-full bg-primary border-2 border-background cursor-nesw-resize z-10"
            onmousedown={(e) => handleResizeStart('bottom-left', e)}
        ></div>
        <div
            class="absolute -bottom-1.5 -right-1.5 h-3 w-3 rounded-full bg-primary border-2 border-background cursor-nwse-resize z-10"
            onmousedown={(e) => handleResizeStart('bottom-right', e)}
        ></div>
        <!-- Edge handles -->
        <div
            class="absolute -top-1 left-1/2 -translate-x-1/2 h-2 w-6 rounded bg-primary border border-background cursor-ns-resize z-10"
            onmousedown={(e) => handleResizeStart('top', e)}
        ></div>
        <div
            class="absolute -bottom-1 left-1/2 -translate-x-1/2 h-2 w-6 rounded bg-primary border border-background cursor-ns-resize z-10"
            onmousedown={(e) => handleResizeStart('bottom', e)}
        ></div>
        <div
            class="absolute top-1/2 -left-1 -translate-y-1/2 h-6 w-2 rounded bg-primary border border-background cursor-ew-resize z-10"
            onmousedown={(e) => handleResizeStart('left', e)}
        ></div>
        <div
            class="absolute top-1/2 -right-1 -translate-y-1/2 h-6 w-2 rounded bg-primary border border-background cursor-ew-resize z-10"
            onmousedown={(e) => handleResizeStart('right', e)}
        ></div>
    {/if}
</div>
