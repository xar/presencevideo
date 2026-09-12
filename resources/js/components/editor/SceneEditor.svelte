<script lang="ts">
    import { onDestroy } from 'svelte';
    import ResizeHandles from '@/components/editor/ResizeHandles.svelte';
    import type { ResizeHandle } from '@/components/editor/ResizeHandles.svelte';
    import { projectStore, selectionStore, timelineStore } from '@/lib/editor';
    import { autoSceneDurationMs } from '@/lib/editor/asset-actions';
    import {
        canvasGuides,
        screenThresholdToProject,
        snapMove,
        snapResize,
    } from '@/lib/editor/canvas-snapping.svelte';
    import type { SnapContext, SnapRect } from '@/lib/editor/canvas-snapping.svelte';
    import {
        computeBackingSize,
        editTargetOf,
        elementScreenBox,
        fitScale,
        frameMediaUrls,
        hitTestElements,
        interactiveElements,
        isSameTarget,
        projectPointFromClient,
        sameUrls,
    } from '@/lib/editor/canvas-view';
    import type { EditTarget } from '@/lib/editor/canvas-view';
    import { drawFrame } from '@/lib/editor/compositor';
    import type { MediaLookup } from '@/lib/editor/compositor';
    import { createPreviewMediaLookup } from '@/lib/editor/media-lookup';
    import type { WarmUpRequest } from '@/lib/editor/media-lookup';
    import type { ResolvedElement } from '@/lib/editor/model/frame';
    import { resolveFrame } from '@/lib/editor/model/resolve-frame';
    import { buildTimeline } from '@/lib/editor/model/timeline';
    import type { SnapRequest } from '@/lib/editor/useDragResize.svelte';
    import { useDragResize } from '@/lib/editor/useDragResize.svelte';
    import type { ImageLayer, Layer, VideoClip, VideoLayer } from '@/types';

    /**
     * The WYSIWYG canvas.
     *
     * Everything visible is painted by the SHARED compositor: the preview
     * resolves a frame with `resolveFrame` and paints it with `drawFrame`,
     * which is exactly what the exporter does, so what is on screen and what
     * ends up in the file cannot drift. The DOM above the canvas is purely an
     * interaction surface — selection ring, resize handles, alignment guides —
     * positioned from the SAME resolved frame that was just painted.
     */

    let project = $derived(projectStore.project);
    let currentTimeMs = $derived(timelineStore.currentTimeMs);
    let currentTool = $derived(selectionStore.tool);

    /** Scene whose background and drop target the canvas represents. */
    let displayedScene = $derived.by(
        () => timelineStore.getCurrentScene() ?? selectionStore.getSelectedScene(),
    );

    /**
     * Built once per project change rather than per frame: resolving a frame is
     * cheap, walking every scene and track to derive absolute timings is not.
     */
    let timeline = $derived(buildTimeline(project));

    /** The single resolve per tick; the painter and the overlay share it. */
    let frame = $derived(resolveFrame(project, currentTimeMs, { timeline }));

    /** Everything grabbable right now, bottom-first, in one global z order. */
    let elements = $derived(interactiveElements(frame));

    let selectedElement = $derived.by((): ResolvedElement | null => {
        const selection = selectionStore.selection;

        return (
            elements.find((element) =>
                element.origin === 'scene'
                    ? element.id === selection.layerId
                    : element.id === selection.videoClipId,
            ) ?? null
        );
    });

    /** Magenta reads clearly over both bright footage and black backgrounds. */
    const GUIDE_COLOR = '#ff4dd2';

    let canvasScale = $state(0.5);
    let containerEl: HTMLDivElement | undefined = $state();
    let stageEl: HTMLDivElement | undefined = $state();
    let canvasEl: HTMLCanvasElement | undefined = $state();
    let isDragOver = $state(false);

    // ---------------------------------------------------------------- sizing

    $effect(() => {
        const element = containerEl;
        if (!element || typeof ResizeObserver === 'undefined') return;

        const observer = new ResizeObserver(() => measure());
        observer.observe(element);
        measure();

        return () => observer.disconnect();
    });

    // Re-fit when the project resolution changes, not only when the pane does.
    $effect(() => {
        void project?.resolution_width;
        void project?.resolution_height;
        measure();
    });

    function measure(): void {
        if (!containerEl || !project) return;

        canvasScale = fitScale(
            containerEl.clientWidth,
            containerEl.clientHeight,
            project.resolution_width,
            project.resolution_height,
        );
    }

    // --------------------------------------------------------------- painting

    const previewMedia = createPreviewMediaLookup();

    // Read-ahead is only worth issuing while the playhead is actually running;
    // a scrub wants the newest position, not a queue of frames behind it.
    $effect(() => {
        previewMedia.setPlaybackMode(timelineStore.isPlaying ? 'playing' : 'idle');
    });

    /**
     * Warm the decoders for whatever the first painted frame needs.
     *
     * Nothing else starts a decode until the renderer misses, so the opening
     * picture would otherwise wait on a container parse, a range fetch and a
     * keyframe decode that could all have run while the editor was mounting.
     */
    let warmedUp = false;

    $effect(() => {
        if (warmedUp) return;

        const requests: WarmUpRequest[] = [];
        const frames = [frame.primary, frame.transition?.incoming];

        for (const resolved of frames) {
            for (const element of resolved?.elements ?? []) {
                if (element.kind !== 'video') continue;
                if (!element.url || element.sourceTimeSec === null) continue;
                requests.push({ url: element.url, timeSec: element.sourceTimeSec });
            }
        }

        if (requests.length === 0) return;

        warmedUp = true;
        previewMedia.warmUp(requests);
    });

    /**
     * A decode miss is transient, so it has to drive a repaint — otherwise a
     * paused playhead keeps showing the hole the first frame had. Retried on a
     * timer rather than on rAF: a permanently unavailable asset would otherwise
     * spin the compositor at 60fps forever.
     */
    let mediaMissing = false;
    const RETRY_MS = 100;

    const trackedMedia: MediaLookup = {
        getImage(url) {
            const source = previewMedia.getImage(url);
            if (!source) mediaMissing = true;
            return source;
        },
        getVideoFrame(url, timeSec) {
            const source = previewMedia.getVideoFrame(url, timeSec);
            if (!source) mediaMissing = true;
            return source;
        },
    };

    let ctx: CanvasRenderingContext2D | null = null;
    let ctxCanvas: HTMLCanvasElement | null = null;
    let frameId: number | null = null;
    let retryId: ReturnType<typeof setTimeout> | null = null;
    let declaredUrls: string[] = [];

    // Repaint whenever the resolved frame or the canvas size changes. `frame`
    // is a memo, so this is one resolve per tick no matter how many readers it
    // has, and the paint itself is coalesced onto the next animation frame.
    $effect(() => {
        void frame;
        void canvasScale;
        void canvasEl;
        schedulePaint();
    });

    // Hold decoders open for exactly the assets on screen. Comparing the URL
    // set keeps this to the handful of ticks where the set actually changes.
    $effect(() => {
        const urls = frameMediaUrls(frame);
        if (sameUrls(urls, declaredUrls)) return;

        declaredUrls = urls;
        previewMedia.sync(urls);
    });

    function schedulePaint(): void {
        if (frameId !== null) return;

        frameId = requestAnimationFrame(() => {
            frameId = null;
            paint();
        });
    }

    function paint(): void {
        const canvas = canvasEl;
        if (!canvas || !project) return;

        if (ctxCanvas !== canvas) {
            ctx = canvas.getContext('2d');
            ctxCanvas = canvas;
        }
        if (!ctx) return;

        const size = computeBackingSize(
            project.resolution_width,
            project.resolution_height,
            canvasScale,
            typeof window === 'undefined' ? 1 : window.devicePixelRatio,
        );

        if (canvas.width !== size.width || canvas.height !== size.height) {
            canvas.width = size.width;
            canvas.height = size.height;
        }

        // Decode preview frames at the size they are actually painted at,
        // device pixels included. A 1080x1920 source in a 265px pane decoded
        // at source size spends most of its decode budget on pixels that are
        // scaled away before anyone sees them.
        previewMedia.setPreviewSurface({ width: size.width, height: size.height });

        // The painter works in PROJECT pixels; the device-pixel ratio is a
        // single transform here and is never baked into resolved geometry.
        ctx.setTransform(size.renderScale, 0, 0, size.renderScale, 0, 0);

        mediaMissing = false;
        drawFrame(ctx, frame, trackedMedia);

        if (retryId !== null) {
            clearTimeout(retryId);
            retryId = null;
        }
        if (mediaMissing) {
            retryId = setTimeout(() => {
                retryId = null;
                schedulePaint();
            }, RETRY_MS);
        }
    }

    onDestroy(() => {
        if (frameId !== null) cancelAnimationFrame(frameId);
        if (retryId !== null) clearTimeout(retryId);
        previewMedia.dispose();
        canvasGuides.clear();
    });

    // ------------------------------------------------------------ interaction

    /** The element the live gesture edits; plain state, read inside callbacks. */
    let activeTarget: EditTarget | null = null;

    const EMPTY_RECT: SnapRect = { x: 0, y: 0, width: 0, height: 0 };

    /**
     * The STORED geometry of an element. Deliberately not the resolved
     * geometry: a drag writes back to the layer, so it has to start from the
     * value it will overwrite, or a keyframed element would jump by its own
     * animation offset on the first pointer move.
     */
    function storedRect(target: EditTarget | null): SnapRect | null {
        if (!target || !project) return null;

        const source =
            target.origin === 'scene'
                ? project.scenes
                      .find((scene) => scene.id === target.containerId)
                      ?.layers.find((layer) => layer.id === target.id)
                : project.video_tracks
                      .find((track) => track.id === target.containerId)
                      ?.clips.find((clip) => clip.id === target.id);

        if (!source) return null;

        return {
            x: source.x,
            y: source.y,
            width: source.width,
            height: source.height,
        };
    }

    // Keep at least this many canvas pixels of an element visible so it can
    // always be grabbed again after a drag
    const MIN_VISIBLE_PX = 40;

    /** Overlay clips are chrome-sized things (logos, badges); layers can be smaller. */
    function minSizeFor(target: EditTarget | null): number {
        return target?.origin === 'track' ? 40 : 20;
    }

    function clampToCanvas(value: number, size: number, canvasSize: number): number {
        const minVisible = Math.min(MIN_VISIBLE_PX, size);
        return Math.max(minVisible - size, Math.min(value, canvasSize - minVisible));
    }

    function clampPositionUpdates(current: SnapRect, updates: Partial<SnapRect>): Partial<SnapRect> {
        if (!project || (updates.x === undefined && updates.y === undefined)) {
            return updates;
        }

        const width = updates.width ?? current.width;
        const height = updates.height ?? current.height;
        const clamped = { ...updates };

        if (clamped.x !== undefined) {
            clamped.x = clampToCanvas(clamped.x, width, project.resolution_width);
        }
        if (clamped.y !== undefined) {
            clamped.y = clampToCanvas(clamped.y, height, project.resolution_height);
        }

        return clamped;
    }

    /**
     * Everything else on the canvas the dragged element can line up against,
     * in the same (stored) space the gesture works in.
     */
    function otherRects(exclude: EditTarget | null): SnapRect[] {
        const rects: SnapRect[] = [];

        for (const element of elements) {
            const target = editTargetOf(element);
            if (isSameTarget(target, exclude)) continue;

            const rect = storedRect(target);
            if (rect) rects.push(rect);
        }

        return rects;
    }

    /**
     * Alt/Option suppresses snapping (matching the timeline's convention). An
     * aspect-locked resize (shift) also skips it: honouring a snapped edge
     * there would either break the locked ratio or fight the ratio's own
     * correction, so the ratio wins and no guides are drawn.
     */
    function runSnap(request: SnapRequest): SnapRect {
        if (!project || request.disabled || (request.mode === 'resize' && request.aspectLocked)) {
            canvasGuides.clear();
            return request.rect;
        }

        const minSize = minSizeFor(activeTarget);
        const context: SnapContext = {
            canvasWidth: project.resolution_width,
            canvasHeight: project.resolution_height,
            others: otherRects(activeTarget),
            thresholdPx: screenThresholdToProject(canvasScale),
            minWidth: minSize,
            minHeight: minSize,
        };

        const result =
            request.mode === 'move'
                ? snapMove(request.rect, context)
                : snapResize(request.rect, request.handle ?? '', context);

        canvasGuides.set(result.guides);

        return result;
    }

    const dragResize = useDragResize({
        getPosition: () => storedRect(activeTarget) ?? EMPTY_RECT,
        onUpdate: (updates) => {
            const target = activeTarget;
            const current = storedRect(target);
            if (!target || !current) return;

            const clamped = clampPositionUpdates(current, updates);

            if (target.origin === 'scene') {
                projectStore.updateLayer(target.containerId, target.id, clamped as Partial<Layer>);
            } else {
                projectStore.updateVideoClip(
                    target.containerId,
                    target.id,
                    clamped as Partial<VideoClip>,
                );
            }
        },
        scale: () => canvasScale,
        minWidth: () => minSizeFor(activeTarget),
        minHeight: () => minSizeFor(activeTarget),
        snap: runSnap,
        // Guides only while the gesture runs; undo batching is owned by the hook.
        onGestureEnd: () => canvasGuides.clear(),
    });

    // Ends a gesture that is still running at teardown; the hook closes its own
    // undo transaction when it does.
    onDestroy(dragResize.cleanup);

    function select(element: ResolvedElement): void {
        if (element.origin === 'scene') {
            selectionStore.selectLayer(element.containerId, element.id);
        } else {
            selectionStore.selectVideoClip(element.containerId, element.id);
        }
    }

    /**
     * Pointerdown (rather than click) so selection and the drag begin in the
     * same event and the gesture can take pointer capture. The canvas is a
     * single surface, so which element was pressed is decided by hit-testing
     * the resolved frame — topmost first, rotation included — instead of by
     * the browser hit-testing one DOM node per layer.
     */
    function handlePointerDown(e: PointerEvent): void {
        if (!project || !stageEl) return;
        // Resize handles are real buttons over the canvas and own their gesture.
        if (e.target instanceof Element && e.target.closest('button')) return;

        const point = projectPointFromClient(
            e.clientX,
            e.clientY,
            stageEl.getBoundingClientRect(),
            canvasScale,
        );
        const hit = hitTestElements(elements, point.x, point.y);

        if (!hit) {
            activeTarget = null;
            if (displayedScene) selectionStore.selectScene(displayedScene.id);
            return;
        }

        select(hit);
        activeTarget = editTargetOf(hit);
        dragResize.handleMouseDown(e);
    }

    function handleResizeStart(handle: ResizeHandle, e: MouseEvent): void {
        if (!selectedElement) return;

        activeTarget = editTargetOf(selectedElement);
        dragResize.handleResizeStart(handle, e);
    }

    function getCursor(): string {
        switch (currentTool) {
            case 'pan':
                return 'grab';
            default:
                return 'default';
        }
    }

    // ------------------------------------------------------------------- drop

    function handleDragOver(e: DragEvent) {
        e.preventDefault();
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'copy';
        }
        isDragOver = true;
    }

    function handleDragLeave() {
        isDragOver = false;
    }

    function handleDrop(e: DragEvent) {
        e.preventDefault();
        isDragOver = false;

        if (!e.dataTransfer || !displayedScene || !stageEl || !project) return;

        const data = e.dataTransfer.getData('application/json');
        if (!data) return;

        try {
            const parsed = JSON.parse(data);
            if (parsed.type !== 'asset') return;

            const drop = projectPointFromClient(
                e.clientX,
                e.clientY,
                stageEl.getBoundingClientRect(),
                canvasScale,
            );

            const assetWidth = parsed.width ?? project.resolution_width;
            const assetHeight = parsed.height ?? project.resolution_height;

            // Center the layer on drop position
            const x = Math.max(0, Math.round(drop.x) - assetWidth / 2);
            const y = Math.max(0, Math.round(drop.y) - assetHeight / 2);

            const layerType = parsed.assetType === 'audio' ? null : parsed.assetType;
            if (!layerType) return;

            const autoDurationMs = autoSceneDurationMs(
                parsed.assetType,
                parsed.durationMs,
                displayedScene.layers.length,
            );

            const layer = projectStore.addLayer(displayedScene.id, {
                type: layerType,
                asset_id: parsed.assetId,
                x: Math.round(x),
                y: Math.round(y),
                width: assetWidth,
                height: assetHeight,
            } as Partial<ImageLayer | VideoLayer>);

            if (autoDurationMs !== null) {
                projectStore.updateScene(displayedScene.id, { duration_ms: autoDurationMs });
            }

            selectionStore.selectLayer(displayedScene.id, layer.id);
        } catch (err) {
            console.error('Failed to handle drop:', err);
        }
    }
</script>

<div
    bind:this={containerEl}
    class="relative flex flex-1 items-center justify-center overflow-hidden bg-muted/50 p-6"
>
    {#if displayedScene && project}
        <div
            bind:this={stageEl}
            class="relative isolate overflow-hidden rounded-lg shadow-lg"
            class:ring-2={isDragOver}
            class:ring-primary={isDragOver}
            class:ring-dashed={isDragOver}
            style:width="{project.resolution_width * canvasScale}px"
            style:height="{project.resolution_height * canvasScale}px"
            style:cursor={getCursor()}
            onpointerdown={handlePointerDown}
            ondragover={handleDragOver}
            ondragleave={handleDragLeave}
            ondrop={handleDrop}
            onkeydown={() => {}}
            role="button"
            tabindex="0"
        >
            <!-- The one painted surface: same resolver, same painter as the export. -->
            <canvas
                bind:this={canvasEl}
                class="block h-full w-full"
                style:background-color={displayedScene.background_color ?? '#000'}
            ></canvas>

            <!-- Selection ring and resize handles, placed on the painted pixels -->
            {#if selectedElement}
                {@const box = elementScreenBox(selectedElement, canvasScale)}
                <div
                    class="pointer-events-none absolute ring-2 ring-primary ring-offset-1 [&>button]:pointer-events-auto"
                    style:left="{box.left}px"
                    style:top="{box.top}px"
                    style:width="{box.width}px"
                    style:height="{box.height}px"
                    style:transform="rotate({box.rotation}deg)"
                >
                    <ResizeHandles onStart={handleResizeStart} />
                </div>
            {/if}

            <!-- Alignment guides (only present mid drag/resize) -->
            {#if canvasGuides.active.length > 0}
                <div class="pointer-events-none absolute inset-0" style:z-index="9999">
                    {#if canvasGuides.hasCenterSnap}
                        <!-- Subtle centre crosshair while a canvas-centre snap holds -->
                        <div
                            class="absolute"
                            style:left="{(project.resolution_width * canvasScale) / 2}px"
                            style:top="0"
                            style:width="1px"
                            style:height="100%"
                            style:background="repeating-linear-gradient(to bottom, {GUIDE_COLOR}66 0 4px, transparent 4px 8px)"
                        ></div>
                        <div
                            class="absolute"
                            style:top="{(project.resolution_height * canvasScale) / 2}px"
                            style:left="0"
                            style:height="1px"
                            style:width="100%"
                            style:background="repeating-linear-gradient(to right, {GUIDE_COLOR}66 0 4px, transparent 4px 8px)"
                        ></div>
                    {/if}

                    {#each canvasGuides.active as guide (guide.orientation + ':' + guide.position)}
                        {#if guide.orientation === 'v'}
                            <div
                                class="absolute"
                                style:left="{guide.position * canvasScale}px"
                                style:top="{guide.from * canvasScale}px"
                                style:height="{(guide.to - guide.from) * canvasScale}px"
                                style:width="1px"
                                style:background-color={GUIDE_COLOR}
                            ></div>
                        {:else}
                            <div
                                class="absolute"
                                style:top="{guide.position * canvasScale}px"
                                style:left="{guide.from * canvasScale}px"
                                style:width="{(guide.to - guide.from) * canvasScale}px"
                                style:height="1px"
                                style:background-color={GUIDE_COLOR}
                            ></div>
                        {/if}
                    {/each}
                </div>
            {/if}

            {#if isDragOver}
                <div
                    class="pointer-events-none absolute inset-0 flex items-center justify-center bg-primary/10"
                >
                    <p class="rounded bg-primary px-3 py-1 text-sm text-white shadow-lg">
                        Drop to add layer
                    </p>
                </div>
            {/if}
        </div>
    {:else}
        <div class="flex flex-col items-center justify-center text-muted-foreground">
            <p>Select a scene to edit</p>
        </div>
    {/if}
</div>
