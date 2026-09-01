<script lang="ts">
    import { onDestroy } from 'svelte';
    import ResizeHandles from '@/components/editor/ResizeHandles.svelte';
import type {ResizeHandle} from '@/components/editor/ResizeHandles.svelte';
    import { projectStore, timelineStore } from '@/lib/editor';
    import { canvasGuides } from '@/lib/editor/canvas-snapping.svelte';
    import {
        adjustmentsToCssFilter,
        clampSpeed,
        clampVolume,
        cssPaintColor,
        supportsAdjustments,
    } from '@/lib/editor/clip-effects';
    import { editorFeatures } from '@/lib/editor/editor-features';
    import { getCachedFramePreviewUrl } from '@/lib/editor/media-cache';
    import { useDragResize  } from '@/lib/editor/useDragResize.svelte';
import type {SnapRequest} from '@/lib/editor/useDragResize.svelte';
    import { cn } from '@/lib/utils';
    import type { Layer } from '@/types';

    /**
     * The single canvas renderer for anything placed on the scene canvas —
     * scene layers and timeline overlay clips alike. The parent decides what
     * "now" means for the element by passing `localTimeMs` (ms elapsed since
     * the element started), so the same component previews a scene layer
     * (scene-relative time) and an overlay clip (clip-relative time).
     */
    let {
        element,
        localTimeMs = 0,
        scale = 1,
        isSelected = false,
        audible = true,
        minSize = 20,
        class: className = '',
        onclick,
        onUpdate,
        snap,
    }: {
        element: Layer;
        localTimeMs?: number;
        scale?: number;
        isSelected?: boolean;
        /** Overlay clip audio is not part of the render, so overlays preview muted. */
        audible?: boolean;
        minSize?: number;
        class?: string;
        onclick?: (e: MouseEvent) => void;
        onUpdate?: (updates: Partial<Layer>) => void;
        snap?: (request: SnapRequest) => { x: number; y: number; width: number; height: number };
    } = $props();

    let videoEl: HTMLVideoElement | undefined = $state();
    let videoReady = $state(false);
    let framePreviewUrl = $state<string | null>(null);
    let lastFrameKey = $state<string | null>(null);
    let isPlaying = $derived(timelineStore.isPlaying);

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

    let speed = $derived(element.type === 'video' ? clampSpeed(element.speed) : 1);

    /**
     * Source time consumed by the element: the trim offset plus the elapsed
     * local time stretched by the constant speed multiplier.
     */
    let targetVideoTime = $derived.by(() => {
        if (element.type !== 'video') return 0;

        return Math.max(0, ((element.trim_start_ms ?? 0) + localTimeMs * speed) / 1000);
    });

    let cssFilter = $derived(
        supportsAdjustments(element) ? adjustmentsToCssFilter(element.adjustments) : 'none',
    );

    let assetUrl = $derived.by(() => {
        if (element.type !== 'video' && element.type !== 'image') return null;

        const assets = projectStore.project?.assets ?? [];
        return assets.find((a) => a.id === element.asset_id)?.url ?? null;
    });

    // Sync video playback with the timeline
    $effect(() => {
        if (!videoEl || element.type !== 'video' || !videoReady) return;

        const playing = isPlaying;
        const videoDuration = Number.isFinite(videoEl.duration) ? videoEl.duration : 0;

        // The clip runs out at its trim end, or at the end of the file. Past
        // that the last frame holds (matching the render's tpad), so the
        // element parks just short of the end instead of fighting the
        // drift-correction loop below.
        const trimEndSec = element.trim_end_ms ? element.trim_end_ms / 1000 : Infinity;
        const contentEndSec = Math.min(trimEndSec, videoDuration > 0 ? videoDuration : Infinity);
        const maxTime = Number.isFinite(contentEndSec) ? Math.max(0, contentEndSec - 0.05) : targetVideoTime;
        const pastContent = targetVideoTime > maxTime;
        const targetTime = Math.min(targetVideoTime, maxTime);
        const drift = Math.abs(videoEl.currentTime - targetTime);

        // Audio is only audible while the timeline actually runs: a paused
        // scrub would otherwise blast fragments on every seek.
        const shouldBeAudible = audible && playing && !pastContent && !(element.muted ?? false);
        videoEl.volume = clampVolume(element.volume);
        if (videoEl.muted !== !shouldBeAudible) {
            videoEl.muted = !shouldBeAudible;
        }

        // The timeline clock already runs at timelineStore.playbackRate, so the
        // element has to consume source time at speed x that rate to stay put.
        const elementRate = speed * timelineStore.playbackRate;
        if (videoEl.playbackRate !== elementRate) {
            videoEl.playbackRate = elementRate;
        }

        if (!playing || pastContent) {
            if (!videoEl.paused) {
                videoEl.pause();
            }

            if (drift > 0.01) {
                videoEl.currentTime = targetTime;
            }
            return;
        }

        // Faster playback consumes source time faster, so allow proportionally
        // more drift before re-seeking (seeking mid-playback is visibly jarring).
        if (drift > 0.05 * Math.max(1, speed)) {
            videoEl.currentTime = targetTime;
        }

        if (videoEl.paused) {
            const el = videoEl;
            el.play().catch((err) => {
                // Autoplay policies can refuse an unmuted element; falling back
                // to muted playback keeps the preview moving.
                if (!el.muted) {
                    el.muted = true;
                    el.play().catch(() => {});
                    return;
                }

                console.warn('Video play failed:', err);
            });
        }
    });

    // Exact frame preview while paused (the <video> element seeks coarsely).
    $effect(() => {
        if (element.type !== 'video') return;
        if (!assetUrl || isPlaying || !editorFeatures.clientPreviewFrames) return;

        const frameKey = `${assetUrl}:${Math.round(targetVideoTime / 0.1)}`;
        if (lastFrameKey === frameKey) return;
        lastFrameKey = frameKey;

        getCachedFramePreviewUrl(assetUrl, targetVideoTime)
            .then((url) => {
                if (lastFrameKey === frameKey) {
                    framePreviewUrl = url;
                }
            })
            .catch(() => {});
    });

    const dragResize = useDragResize({
        getPosition: () => ({ x: element.x, y: element.y, width: element.width, height: element.height }),
        onUpdate: (updates) => onUpdate?.(updates),
        scale: () => scale,
        minWidth: () => minSize,
        minHeight: () => minSize,
        snap: (request) => snap?.(request) ?? request.rect,
        // Guides only while the gesture runs; undo batching is owned by the hook.
        onGestureEnd: () => canvasGuides.clear(),
    });

    /**
     * Pointerdown (rather than mousedown) so the drag can take pointer capture.
     * Resize handles are real buttons nested inside this element and fire their
     * own gesture, so a press that started on one must not also start a drag.
     */
    function handlePointerDown(e: PointerEvent) {
        if (e.target instanceof Element && e.target.closest('button')) return;
        dragResize.handleMouseDown(e);
    }

    function handleResizeStart(corner: ResizeHandle, e: MouseEvent) {
        dragResize.handleResizeStart(corner, e);
    }

    onDestroy(dragResize.cleanup);
</script>

<div
    class={cn('absolute cursor-move', isSelected && 'ring-2 ring-primary ring-offset-1', className)}
    style:left="{element.x * scale}px"
    style:top="{element.y * scale}px"
    style:width="{element.width * scale}px"
    style:height="{element.height * scale}px"
    style:transform="rotate({element.rotation ?? 0}deg)"
    style:opacity={element.opacity ?? 1}
    onpointerdown={handlePointerDown}
    onclick={onclick}
    onkeydown={() => {}}
    role="button"
    tabindex="0"
>
    {#if element.type === 'image'}
        {#if assetUrl}
            <img
                src={assetUrl}
                alt=""
                class="h-full w-full object-cover pointer-events-none"
                style:filter={cssFilter}
                draggable="false"
            />
        {:else}
            <div class="h-full w-full bg-muted flex items-center justify-center">
                <span class="text-xs text-muted-foreground">Image</span>
            </div>
        {/if}
    {:else if element.type === 'video'}
        {#if assetUrl}
            {#if framePreviewUrl && !isPlaying}
                <img
                    src={framePreviewUrl}
                    alt=""
                    class="absolute inset-0 h-full w-full object-cover pointer-events-none"
                    style:filter={cssFilter}
                    draggable="false"
                />
            {/if}
            <video
                bind:this={videoEl}
                src={assetUrl}
                style:filter={cssFilter}
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
    {:else if element.type === 'text'}
        {@const strokeWidth = (element.stroke_width ?? 0) * scale}
        {@const strokeColor = element.stroke_color ?? '#000000'}
        <div
            class="flex h-full w-full items-center overflow-hidden"
            style:font-family={element.font_family ?? 'system-ui'}
            style:font-size="{(element.font_size ?? 48) * scale}px"
            style:color={element.font_color ?? '#ffffff'}
            style:font-weight={element.font_weight ?? 'normal'}
            style:background-color={cssPaintColor(element.background_color)}
            style:padding="{(element.padding ?? 0) * scale}px"
            style:-webkit-text-stroke={strokeWidth > 0 ? `${strokeWidth}px ${strokeColor}` : 'none'}
            style:paint-order={strokeWidth > 0 ? 'stroke fill' : 'normal'}
        >
            <!-- Full-width child so text-align actually applies -->
            <div class="w-full whitespace-pre-wrap" style:text-align={element.text_align ?? 'center'}>
                {element.text}
            </div>
        </div>
    {:else if element.type === 'shape'}
        {@const borderWidth = Math.max(0, element.border_width ?? 0) * scale}
        {@const radius = element.shape === 'ellipse'
            ? '50%'
            : `${Math.max(0, element.corner_radius ?? 0) * scale}px`}
        <div
            class="h-full w-full pointer-events-none"
            style:background-color={cssPaintColor(element.fill_color)}
            style:border={borderWidth > 0
                ? `${borderWidth}px solid ${cssPaintColor(element.border_color, '#000000')}`
                : 'none'}
            style:border-radius={radius}
            style:box-sizing="border-box"
        ></div>
    {/if}

    {#if isSelected}
        <ResizeHandles onStart={handleResizeStart} />
    {/if}
</div>
