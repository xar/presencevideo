<script lang="ts">
    import { onDestroy } from 'svelte';
    import ResizeHandles, { type ResizeHandle } from '@/components/editor/ResizeHandles.svelte';
    import { projectStore, timelineStore, selectionStore } from '@/lib/editor';
    import { historyStore } from '@/lib/editor/history.svelte';
    import { editorFeatures } from '@/lib/editor/editor-features';
    import { getCachedFramePreviewUrl } from '@/lib/editor/media-cache';
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
    let framePreviewUrl = $state<string | null>(null);
    let lastFrameKey = $state<string | null>(null);
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

    function handleResizeStart(corner: ResizeHandle, e: MouseEvent) {
        historyStore.beginBatch();
        dragResize.handleResizeStart(corner, e);
        const onUp = () => {
            historyStore.endBatch();
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mouseup', onUp);
    }

    function getAssetUrl(): string | null {
        if (clip.type === 'text') {
            return null;
        }

        const assets = projectStore.project?.assets ?? [];
        const asset = assets.find((a) => a.id === clip.asset_id);
        return asset?.url ?? null;
    }

    let assetUrl = $derived(getAssetUrl());

    $effect(() => {
        if (!assetUrl || isPlaying || !editorFeatures.clientPreviewFrames) return;

        const frameKey = `${assetUrl}:${Math.round(clipTimeMs / 250)}`;
        if (lastFrameKey === frameKey) return;
        lastFrameKey = frameKey;

        getCachedFramePreviewUrl(assetUrl, clipTimeMs / 1000)
            .then((url) => {
                if (lastFrameKey === frameKey) {
                    framePreviewUrl = url;
                }
            })
            .catch(() => {});
    });

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
    {#if clip.type === 'text'}
        {@const strokeWidth = (clip.stroke_width ?? 0) * scale}
        {@const strokeColor = clip.stroke_color ?? '#000000'}
        <div
            class="flex h-full w-full items-center justify-center overflow-hidden rounded px-3 text-center"
            style:font-size="{(clip.font_size ?? 48) * scale}px"
            style:color={clip.font_color ?? '#ffffff'}
            style:font-weight={clip.font_weight ?? 'bold'}
            style:text-align={clip.text_align ?? 'center'}
            style:background-color={clip.background_color ?? 'transparent'}
            style:-webkit-text-stroke={strokeWidth > 0 ? `${strokeWidth}px ${strokeColor}` : 'none'}
            style:paint-order={strokeWidth > 0 ? 'stroke fill' : 'normal'}
        >
            {clip.text ?? 'Text Overlay'}
        </div>
    {:else if assetUrl}
        {#if framePreviewUrl && !isPlaying}
            <img
                src={framePreviewUrl}
                alt="Video frame preview"
                class="absolute inset-0 h-full w-full object-cover pointer-events-none"
            />
        {/if}
        <video
            bind:this={videoEl}
            src={assetUrl}
            class="h-full w-full object-cover pointer-events-none {framePreviewUrl && !isPlaying ? 'opacity-0' : ''}"
            muted
            playsinline
            preload="metadata"
        ></video>
    {:else}
        <div class="h-full w-full bg-muted flex items-center justify-center">
            <span class="text-xs text-muted-foreground">Video</span>
        </div>
    {/if}

    {#if isSelected}
        <ResizeHandles onStart={handleResizeStart} />
    {/if}
</div>
