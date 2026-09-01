<script lang="ts">
    import { onDestroy } from 'svelte';
    import { projectStore, selectionStore, timelineStore } from '@/lib/editor';
    import { autoSceneDurationMs } from '@/lib/editor/asset-actions';
    import {
        canvasGuides,
        screenThresholdToProject,
        snapMove,
        snapResize
        
        
    } from '@/lib/editor/canvas-snapping.svelte';
import type {SnapContext, SnapRect} from '@/lib/editor/canvas-snapping.svelte';
    import { effectiveTransition, isPreviewableTransition } from '@/lib/editor/transitions';
    import type { SnapRequest } from '@/lib/editor/useDragResize.svelte';
    import type { Layer, ImageLayer, VideoLayer, VideoClip } from '@/types';
    import CanvasElement from './CanvasElement.svelte';
    import SubtitleOverlay from './SubtitleOverlay.svelte';

    let project = $derived(projectStore.project);
    let currentTimeMs = $derived(timelineStore.currentTimeMs);
    let currentTool = $derived(selectionStore.tool);

    let displayedScene = $derived.by(() => {
        return timelineStore.getCurrentScene() ?? selectionStore.getSelectedScene();
    });

    /** Playhead position relative to the displayed scene's start. */
    let sceneLocalTimeMs = $derived.by(() => {
        const scenes = project?.scenes ?? [];
        let accumulated = 0;
        for (const scene of scenes) {
            if (scene.id === displayedScene?.id) {
                return Math.max(0, currentTimeMs - accumulated);
            }
            accumulated += scene.duration_ms;
        }
        return 0;
    });

    // Compute active video clips that should be displayed at current time
    type ActiveVideoClip = { trackId: string; clip: VideoClip };
    let activeVideoClips = $derived.by((): ActiveVideoClip[] => {
        if (!project?.video_tracks?.length) return [];

        const clips: ActiveVideoClip[] = [];

        for (const track of project.video_tracks) {
            // Skip hidden tracks
            if (track.visible === false) continue;

            for (const clip of track.clips) {
                const clipStart = clip.start_ms;
                const clipEnd = clip.start_ms + clip.duration_ms;

                // Check if current time is within clip's time range
                if (currentTimeMs >= clipStart && currentTimeMs < clipEnd) {
                    clips.push({ trackId: track.id, clip });
                }
            }
        }

        // Sort by z_index
        return clips.sort((a, b) => a.clip.z_index - b.clip.z_index);
    });

    /**
     * Cosmetic preview of the transition leaving the displayed scene.
     *
     * Only fade-family transitions are approximated (as a ramp to black/white
     * over the last `duration_ms` of the scene); slide/wipe/circle transitions
     * are not previewed. Note the preview timeline does NOT shorten the way the
     * render does — scenes stay sequential here.
     */
    let transitionOverlay = $derived.by((): { color: string; opacity: number } | null => {
        const scenes = project?.scenes ?? [];
        const index = scenes.findIndex((scene) => scene.id === displayedScene?.id);
        if (index < 0 || index >= scenes.length - 1) return null;

        const transition = effectiveTransition(scenes[index], scenes[index + 1]);
        if (!transition || !isPreviewableTransition(transition.type)) return null;

        let sceneStartMs = 0;
        for (let i = 0; i < index; i++) {
            sceneStartMs += scenes[i].duration_ms;
        }

        const remainingMs = sceneStartMs + scenes[index].duration_ms - currentTimeMs;
        if (remainingMs < 0 || remainingMs > transition.duration_ms) return null;

        return {
            color: transition.type === 'fadewhite' ? '#ffffff' : '#000000',
            opacity: 1 - remainingMs / transition.duration_ms,
        };
    });

    /** Magenta reads clearly over both bright footage and black backgrounds. */
    const GUIDE_COLOR = '#ff4dd2';

    let canvasScale = $state(0.5);
    let containerEl: HTMLDivElement;
    let canvasEl: HTMLDivElement | undefined = $state();
    let isDragOver = $state(false);

    $effect(() => {
        if (containerEl && project) {
            const containerWidth = containerEl.clientWidth - 48;
            const containerHeight = containerEl.clientHeight - 48;
            const scaleX = containerWidth / project.resolution_width;
            const scaleY = containerHeight / project.resolution_height;
            canvasScale = Math.min(scaleX, scaleY, 1);
        }
    });

    onDestroy(() => canvasGuides.clear());

    function handleLayerClick(layer: Layer, e: MouseEvent) {
        e.stopPropagation();
        if (displayedScene) {
            selectionStore.selectLayer(displayedScene.id, layer.id);
        }
    }

    function handleCanvasClick() {
        if (!displayedScene || !canvasEl) return;

        selectionStore.selectScene(displayedScene.id);
    }

    // Keep at least this many canvas pixels of an element visible so it can
    // always be grabbed again after a drag
    const MIN_VISIBLE_PX = 40;

    function clampToCanvas(value: number, size: number, canvasSize: number): number {
        const minVisible = Math.min(MIN_VISIBLE_PX, size);
        return Math.max(minVisible - size, Math.min(value, canvasSize - minVisible));
    }

    function clampPositionUpdates<T extends { x: number; y: number; width: number; height: number }>(
        current: T,
        updates: Partial<T>,
    ): Partial<T> {
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

    function handleLayerUpdate(layer: Layer, updates: Partial<Layer>) {
        if (displayedScene) {
            projectStore.updateLayer(displayedScene.id, layer.id, clampPositionUpdates(layer, updates));
        }
    }

    function handleVideoClipClick(trackId: string, clip: VideoClip, e: MouseEvent) {
        e.stopPropagation();
        selectionStore.selectVideoClip(trackId, clip.id);
    }

    function handleVideoClipUpdate(trackId: string, clip: VideoClip, updates: Partial<VideoClip>) {
        projectStore.updateVideoClip(trackId, clip.id, clampPositionUpdates(clip, updates));
    }

    /**
     * Everything else currently visible on the canvas that the dragged element
     * can line up against: the scene's other layers plus the overlay clips that
     * are live at the playhead.
     */
    function otherRects(excludeLayerId?: string, excludeClipId?: string): SnapRect[] {
        const rects: SnapRect[] = [];

        for (const layer of displayedScene?.layers ?? []) {
            if (layer.id === excludeLayerId) continue;
            rects.push({ x: layer.x, y: layer.y, width: layer.width, height: layer.height });
        }

        for (const { clip } of activeVideoClips) {
            if (clip.id === excludeClipId) continue;
            rects.push({ x: clip.x, y: clip.y, width: clip.width, height: clip.height });
        }

        return rects;
    }

    /**
     * Builds the `snap` callback handed to a draggable element.
     *
     * Alt/Option suppresses snapping (matching the timeline's convention). An
     * aspect-locked resize (shift) also skips it: honouring a snapped edge there
     * would either break the locked ratio or fight the ratio's own correction,
     * so the ratio wins and no guides are drawn.
     */
    function createSnapHandler(
        minWidth: number,
        minHeight: number,
        excludeLayerId?: string,
        excludeClipId?: string,
    ) {
        return (request: SnapRequest): SnapRect => {
            if (!project || request.disabled || (request.mode === 'resize' && request.aspectLocked)) {
                canvasGuides.clear();
                return request.rect;
            }

            const context: SnapContext = {
                canvasWidth: project.resolution_width,
                canvasHeight: project.resolution_height,
                others: otherRects(excludeLayerId, excludeClipId),
                thresholdPx: screenThresholdToProject(canvasScale),
                minWidth,
                minHeight,
            };

            const result =
                request.mode === 'move'
                    ? snapMove(request.rect, context)
                    : snapResize(request.rect, request.handle ?? '', context);

            canvasGuides.set(result.guides);

            return result;
        };
    }

    let sortedLayers = $derived(
        displayedScene
            ? [...(displayedScene.layers ?? [])].sort((a, b) => a.z_index - b.z_index)
            : [],
    );

    function getCursor(): string {
        switch (currentTool) {
            case 'pan':
                return 'grab';
            default:
                return 'default';
        }
    }

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

        if (!e.dataTransfer || !displayedScene || !canvasEl || !project) return;

        const data = e.dataTransfer.getData('application/json');
        if (!data) return;

        try {
            const parsed = JSON.parse(data);
            if (parsed.type !== 'asset') return;

            const rect = canvasEl.getBoundingClientRect();
            const dropX = Math.round((e.clientX - rect.left) / canvasScale);
            const dropY = Math.round((e.clientY - rect.top) / canvasScale);

            const assetWidth = parsed.width ?? project.resolution_width;
            const assetHeight = parsed.height ?? project.resolution_height;

            // Center the layer on drop position
            const x = Math.max(0, dropX - assetWidth / 2);
            const y = Math.max(0, dropY - assetHeight / 2);

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
            bind:this={canvasEl}
            class="relative isolate overflow-hidden rounded-lg shadow-lg transition-all"
            class:ring-2={isDragOver}
            class:ring-primary={isDragOver}
            class:ring-dashed={isDragOver}
            style:width="{project.resolution_width * canvasScale}px"
            style:height="{project.resolution_height * canvasScale}px"
            style:background-color={displayedScene.background_color ?? '#000'}
            style:cursor={getCursor()}
            onclick={handleCanvasClick}
            ondragover={handleDragOver}
            ondragleave={handleDragLeave}
            ondrop={handleDrop}
            onkeydown={() => {}}
            role="button"
            tabindex="0"
        >
            {#each sortedLayers as layer (layer.id)}
                <CanvasElement
                    element={layer}
                    localTimeMs={sceneLocalTimeMs}
                    scale={canvasScale}
                    isSelected={selectionStore.selection.layerId === layer.id}
                    onclick={(e) => handleLayerClick(layer, e)}
                    onUpdate={(updates) => handleLayerUpdate(layer, updates)}
                    snap={createSnapHandler(20, 20, layer.id)}
                />
            {/each}

            <!-- Approximate fade transition into the next scene (cosmetic) -->
            {#if transitionOverlay}
                <div
                    class="pointer-events-none absolute inset-0"
                    style:background-color={transitionOverlay.color}
                    style:opacity={transitionOverlay.opacity}
                ></div>
            {/if}

            <!-- Video track overlays (PIP, watermarks, etc.) -->
            {#each activeVideoClips as { trackId, clip } (clip.id)}
                <CanvasElement
                    element={clip}
                    localTimeMs={currentTimeMs - clip.start_ms}
                    scale={canvasScale}
                    isSelected={selectionStore.selection.videoClipId === clip.id}
                    audible={false}
                    minSize={40}
                    class="z-[100]"
                    onclick={(e) => handleVideoClipClick(trackId, clip, e)}
                    onUpdate={(updates) => handleVideoClipUpdate(trackId, clip, updates)}
                    snap={createSnapHandler(40, 40, undefined, clip.id)}
                />
            {/each}

            <!-- Subtitle overlay -->
            <SubtitleOverlay scale={canvasScale} />

            <!-- Alignment guides (only present mid drag/resize) -->
            {#if canvasGuides.active.length > 0}
                <div class="pointer-events-none absolute inset-0" style:z-index="9999">
                    {#if canvasGuides.hasCenterSnap}
                        <!-- Subtle centre crosshair while a canvas-centre snap holds -->
                        <div
                            class="absolute"
                            style:left="{project.resolution_width * canvasScale / 2}px"
                            style:top="0"
                            style:width="1px"
                            style:height="100%"
                            style:background="repeating-linear-gradient(to bottom, {GUIDE_COLOR}66 0 4px, transparent 4px 8px)"
                        ></div>
                        <div
                            class="absolute"
                            style:top="{project.resolution_height * canvasScale / 2}px"
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
                <div class="absolute inset-0 flex items-center justify-center pointer-events-none bg-primary/10">
                    <p class="text-white text-sm bg-primary px-3 py-1 rounded shadow-lg">
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
