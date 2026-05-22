<script lang="ts">
    import { onDestroy } from 'svelte';
    import ResizeHandles, { type ResizeHandle } from '@/components/editor/ResizeHandles.svelte';
    import { projectStore, timelineStore, selectionStore } from '@/lib/editor';
    import { historyStore } from '@/lib/editor/history.svelte';
    import { editorFeatures } from '@/lib/editor/editor-features';
    import { getCachedFramePreviewUrl } from '@/lib/editor/media-cache';
    import { useDragResize } from '@/lib/editor/useDragResize.svelte';
    import { cn } from '@/lib/utils';
    import type { Layer, TextLayer, ImageLayer, VideoLayer } from '@/types';

    let {
        layer,
        sceneId,
        scale = 1,
        isSelected = false,
        onclick,
        onUpdate,
    }: {
        layer: Layer;
        sceneId?: string;
        scale?: number;
        isSelected?: boolean;
        onclick?: (e: MouseEvent) => void;
        onUpdate?: (updates: Partial<Layer>) => void;
    } = $props();

    let videoEl: HTMLVideoElement | undefined = $state();
    let videoReady = $state(false);
    let framePreviewUrl = $state<string | null>(null);
    let lastFrameKey = $state<string | null>(null);
    let isPlaying = $derived(timelineStore.isPlaying);
    let currentTimeMs = $derived(timelineStore.currentTimeMs);

    // Track video metadata loading
    $effect(() => {
        if (!videoEl) {
            videoReady = false;
            return;
        }

        videoReady = false;

        if (videoEl.readyState >= 1) {
            videoReady = true;
            return;
        }

        const handleLoaded = () => {
            videoReady = true;
        };

        videoEl.addEventListener('loadedmetadata', handleLoaded);
        return () => {
            videoEl?.removeEventListener('loadedmetadata', handleLoaded);
        };
    });

    // Calculate time within the current scene based on timeline position
    let sceneTimeMs = $derived.by(() => {
        const project = projectStore.project;
        if (!project?.scenes?.length) return 0;

        const targetSceneId = sceneId
            ?? timelineStore.getCurrentScene()?.id
            ?? selectionStore.getSelectedScene()?.id;
        if (!targetSceneId) return 0;

        let accumulated = 0;
        for (const scene of project.scenes) {
            if (scene.id === targetSceneId) {
                return Math.max(0, currentTimeMs - accumulated);
            }
            accumulated += scene.duration_ms;
        }
        return 0;
    });

    let targetVideoTime = $derived.by(() => {
        if (layer.type !== 'video') return 0;

        const videoLayer = layer as VideoLayer;
        const trimStart = videoLayer.trim_start_ms ?? 0;

        return Math.max(0, (sceneTimeMs + trimStart) / 1000);
    });

    let videoAssetUrl = $derived.by(() => {
        if (layer.type !== 'video') return null;

        return getAssetUrl((layer as VideoLayer).asset_id);
    });

    // Sync video playback with timeline
    $effect(() => {
        if (!videoEl || layer.type !== 'video' || !videoReady) return;

        const playing = isPlaying;
        const videoDuration = Number.isFinite(videoEl.duration) ? videoEl.duration : 0;
        const maxTime = videoDuration > 0 ? Math.max(0, videoDuration - 0.01) : targetVideoTime;
        const targetTime = Math.min(targetVideoTime, maxTime);
        const drift = Math.abs(videoEl.currentTime - targetTime);

        if (!playing) {
            if (!videoEl.paused) {
                videoEl.pause();
            }

            if (drift > 0.01) {
                videoEl.currentTime = targetTime;
            }
            return;
        }

        if (drift > 0.05) {
            videoEl.currentTime = targetTime;
        }

        if (videoEl.paused) {
            videoEl.play().catch((err) => {
                console.warn('Video play failed:', err);
            });
        }
    });

    $effect(() => {
        if (!videoAssetUrl || isPlaying || !editorFeatures.clientPreviewFrames) return;

        const frameKey = `${videoAssetUrl}:${Math.round(targetVideoTime / 0.1)}`;
        if (lastFrameKey === frameKey) return;
        lastFrameKey = frameKey;

        getCachedFramePreviewUrl(videoAssetUrl, targetVideoTime)
            .then((url) => {
                if (lastFrameKey === frameKey) {
                    framePreviewUrl = url;
                }
            })
            .catch(() => {});
    });

    const dragResize = useDragResize({
        getPosition: () => ({ x: layer.x, y: layer.y, width: layer.width, height: layer.height }),
        onUpdate: (updates) => onUpdate?.(updates),
        scale: () => scale,
        minWidth: 20,
        minHeight: 20,
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

    function getAssetUrl(assetId: number): string | null {
        const assets = projectStore.project?.assets ?? [];
        const asset = assets.find((a) => a.id === assetId);
        return asset?.url ?? null;
    }

    onDestroy(() => {
        dragResize.cleanup();
    });
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
            {#if framePreviewUrl && !isPlaying}
                <img
                    src={framePreviewUrl}
                    alt="Video frame preview"
                    class="absolute inset-0 h-full w-full object-cover pointer-events-none"
                    draggable="false"
                />
            {/if}
            <video
                bind:this={videoEl}
                src={url}
                class="h-full w-full object-cover pointer-events-none {framePreviewUrl && !isPlaying ? 'opacity-0' : ''}"
                playsinline
                preload="auto"
                muted
            ></video>
        {:else}
            <div class="h-full w-full bg-muted flex items-center justify-center">
                <span class="text-xs text-muted-foreground">Video</span>
            </div>
        {/if}
    {:else if layer.type === 'text'}
        {@const textLayer = layer as TextLayer}
        {@const strokeWidth = (textLayer.stroke_width ?? 0) * scale}
        {@const strokeColor = textLayer.stroke_color ?? '#000000'}
        <div
            class="flex h-full w-full items-center justify-center p-2 overflow-hidden"
            style:font-family={textLayer.font_family ?? 'system-ui'}
            style:font-size="{(textLayer.font_size ?? 48) * scale}px"
            style:color={textLayer.font_color ?? '#ffffff'}
            style:font-weight={textLayer.font_weight ?? 'normal'}
            style:text-align={textLayer.text_align ?? 'center'}
            style:background-color={textLayer.background_color ?? 'transparent'}
            style:padding="{(textLayer.padding ?? 0) * scale}px"
            style:-webkit-text-stroke={strokeWidth > 0 ? `${strokeWidth}px ${strokeColor}` : 'none'}
            style:paint-order={strokeWidth > 0 ? 'stroke fill' : 'normal'}
        >
            {textLayer.text}
        </div>
    {/if}

    {#if isSelected}
        <ResizeHandles onStart={handleResizeStart} />
    {/if}
</div>
