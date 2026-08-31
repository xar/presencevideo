<script lang="ts">
    import { projectStore, selectionStore, timelineStore } from '@/lib/editor';
    import type { Scene, Layer, ImageLayer, VideoLayer, VideoClip, VideoTrack } from '@/types';
    import LayerItem from './LayerItem.svelte';
    import SubtitleOverlay from './SubtitleOverlay.svelte';
    import VideoTrackOverlay from './VideoTrackOverlay.svelte';

    let project = $derived(projectStore.project);
    let isPlaying = $derived(timelineStore.isPlaying);
    let currentTimeMs = $derived(timelineStore.currentTimeMs);
    let currentTool = $derived(selectionStore.tool);

    let displayedScene = $derived.by(() => {
        return timelineStore.getCurrentScene() ?? selectionStore.getSelectedScene();
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

    // Keep the selected scene in sync when playback or scrubbing crosses scene boundaries.
    $effect(() => {
        const currentScene = timelineStore.getCurrentScene();
        if (currentScene && selectionStore.selection.sceneId !== currentScene.id) {
            selectionStore.selectScene(currentScene.id);
        }
    });

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

    function handleLayerClick(layer: Layer, e: MouseEvent) {
        e.stopPropagation();
        if (displayedScene) {
            selectionStore.selectLayer(displayedScene.id, layer.id);
        }
    }

    function handleCanvasClick(e: MouseEvent) {
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

    let sortedLayers = $derived(
        displayedScene
            ? [...displayedScene.layers].sort((a, b) => a.z_index - b.z_index)
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

            const layer = projectStore.addLayer(displayedScene.id, {
                type: layerType,
                asset_id: parsed.assetId,
                x: Math.round(x),
                y: Math.round(y),
                width: assetWidth,
                height: assetHeight,
            } as Partial<ImageLayer | VideoLayer>);

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
            class="relative overflow-hidden rounded-lg shadow-lg transition-all"
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
                <LayerItem
                    {layer}
                    sceneId={displayedScene.id}
                    scale={canvasScale}
                    isSelected={selectionStore.selection.layerId === layer.id}
                    onclick={(e) => handleLayerClick(layer, e)}
                    onUpdate={(updates) => handleLayerUpdate(layer, updates)}
                />
            {/each}

            <!-- Video track overlays (PIP, watermarks, etc.) -->
            {#each activeVideoClips as { trackId, clip } (clip.id)}
                <VideoTrackOverlay
                    {clip}
                    {trackId}
                    scale={canvasScale}
                    isSelected={selectionStore.selection.videoClipId === clip.id}
                    onclick={(e) => handleVideoClipClick(trackId, clip, e)}
                    onUpdate={(updates) => handleVideoClipUpdate(trackId, clip, updates)}
                />
            {/each}

            <!-- Subtitle overlay -->
            <SubtitleOverlay scale={canvasScale} />

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
