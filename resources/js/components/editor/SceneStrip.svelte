<script lang="ts">
    import { onDestroy } from 'svelte';
    import { Plus } from 'lucide-svelte';
    import { Button } from '@/components/ui/button';
    import { projectStore, timelineStore, selectionStore } from '@/lib/editor';
    import { getCanvasFitDimensions } from '@/lib/editor/asset-actions';
    import { historyStore } from '@/lib/editor/history.svelte';
    import { collectSnapPoints, applySnap } from '@/lib/editor/snapping';
    import type { Scene } from '@/types';
    import SceneCard from './SceneCard.svelte';
    import TimelinePlayhead from './TimelinePlayhead.svelte';

    const MIN_WIDTH = 48;
    const MIN_DURATION_MS = 500;

    let scenes = $derived(projectStore.project?.scenes ?? []);
    let assets = $derived(projectStore.project?.assets ?? []);
    let selectedSceneId = $derived(selectionStore.selection.sceneId);
    let isPlaying = $derived(timelineStore.isPlaying);
    let playingSceneIndex = $derived(timelineStore.getCurrentSceneIndex());
    let pixelsPerMs = $derived(timelineStore.pixelsPerMs);
    let totalDuration = $derived(timelineStore.getTotalDuration());
    let timelineWidth = $derived(Math.max(totalDuration * pixelsPerMs, 1));
    let isDragOverStrip = $state(false);

    // Resize state
    let isResizing = $state(false);
    let resizeSceneId = $state<string | null>(null);
    let resizeStartX = $state(0);
    let resizeStartDuration = $state(0);
    let resizeSceneStartMs = $state(0);
    let resizeSnapPoints: number[] = [];

    function getSceneWidth(scene: Scene): number {
        return Math.max(MIN_WIDTH, scene.duration_ms * pixelsPerMs);
    }

    function addScene() {
        const scene = projectStore.addScene();
        selectionStore.selectScene(scene.id);
    }

    function handleSceneClick(scene: Scene) {
        selectionStore.selectScene(scene.id);
        const sceneIndex = scenes.findIndex((s) => s.id === scene.id);
        if (sceneIndex >= 0) {
            timelineStore.seekToScene(sceneIndex);
        }
    }

    let isScrubbing = $state(false);

    function handleTimelinePointer(e: PointerEvent) {
        if (!totalDuration) return;

        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, timelineWidth));
        timelineStore.setCurrentTime(x / pixelsPerMs);
    }

    // Scrub only when the gesture starts on empty strip space — gestures that
    // start on a scene card (select, drag-reorder, resize) must not seek
    function handleTimelinePointerDown(e: PointerEvent) {
        if (e.target !== e.currentTarget) return;

        isScrubbing = true;
        // Capture the pointer so scrubbing keeps tracking outside the strip
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        handleTimelinePointer(e);
    }

    function handleTimelinePointerMove(e: PointerEvent) {
        if (isScrubbing && e.buttons === 1) {
            handleTimelinePointer(e);
        }
    }

    function handleTimelinePointerUp() {
        isScrubbing = false;
    }

    let draggedIndex: number | null = null;

    function handleDragStart(e: DragEvent, index: number) {
        draggedIndex = index;
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(index));
        }
    }

    function handleDragOver(e: DragEvent, index: number) {
        e.preventDefault();
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'move';
        }
    }

    function handleDrop(e: DragEvent, targetIndex: number) {
        e.preventDefault();
        if (draggedIndex !== null && draggedIndex !== targetIndex) {
            projectStore.reorderScenes(draggedIndex, targetIndex);
        }
        draggedIndex = null;
    }

    function handleDragEnd() {
        draggedIndex = null;
    }

    // Handle dropping assets to create new scenes
    function handleStripDragOver(e: DragEvent) {
        e.preventDefault();
        // Check if this is an asset drop (not a scene reorder)
        if (e.dataTransfer?.types.includes('application/json')) {
            e.dataTransfer.dropEffect = 'copy';
            isDragOverStrip = true;
        }
    }

    function handleStripDragLeave(e: DragEvent) {
        // Only set to false if we're leaving the strip entirely
        const relatedTarget = e.relatedTarget as HTMLElement | null;
        if (!relatedTarget || !e.currentTarget || !(e.currentTarget as HTMLElement).contains(relatedTarget)) {
            isDragOverStrip = false;
        }
    }

    function handleStripDrop(e: DragEvent) {
        e.preventDefault();
        isDragOverStrip = false;

        if (!e.dataTransfer || !projectStore.project) return;

        const data = e.dataTransfer.getData('application/json');
        if (!data) return;

        try {
            const parsed = JSON.parse(data);
            if (parsed.type !== 'asset') return;

            // Only allow video and image assets to create scenes
            if (parsed.assetType !== 'video' && parsed.assetType !== 'image') return;

            const project = projectStore.project;
            const asset = project.assets?.find(a => a.id === parsed.assetId);
            const sceneDuration = parsed.assetType === 'video' ? (asset?.duration_ms ?? 5000) : 5000;
            const fit = getCanvasFitDimensions(project, {
                width: parsed.width,
                height: parsed.height,
            });

            const scene = projectStore.addScene({
                name: asset?.name ?? `Scene ${scenes.length + 1}`,
                duration_ms: sceneDuration,
            });

            const layer = projectStore.addLayer(scene.id, {
                type: parsed.assetType,
                asset_id: parsed.assetId,
                ...fit,
            });

            selectionStore.selectLayer(scene.id, layer.id);
        } catch (err) {
            console.error('Failed to create scene from asset:', err);
        }
    }

    // Resize handlers
    function handleResizeStart(e: MouseEvent, scene: Scene) {
        historyStore.beginBatch();
        isResizing = true;
        resizeSceneId = scene.id;
        resizeStartX = e.clientX;
        resizeStartDuration = scene.duration_ms;

        // Absolute timeline offset where this scene starts
        let sceneStart = 0;
        for (const s of scenes) {
            if (s.id === scene.id) break;
            sceneStart += s.duration_ms;
        }
        resizeSceneStartMs = sceneStart;

        // Snap the scene's right edge to other boundaries/clips/playhead,
        // excluding the scene's own current end so it isn't sticky.
        const originalEnd = sceneStart + scene.duration_ms;
        resizeSnapPoints = collectSnapPoints(projectStore.project, {
            playheadMs: timelineStore.currentTimeMs,
        }).filter((point) => point !== originalEnd);

        window.addEventListener('mousemove', handleResizeMove);
        window.addEventListener('mouseup', handleResizeEnd);
    }

    function handleResizeMove(e: MouseEvent) {
        if (!isResizing || !resizeSceneId) return;

        const deltaX = e.clientX - resizeStartX;
        const deltaDuration = deltaX / pixelsPerMs;
        let newEnd = resizeSceneStartMs + resizeStartDuration + deltaDuration;

        if (!e.altKey) {
            const snap = applySnap(newEnd, resizeSnapPoints, pixelsPerMs);
            if (snap.snapped) {
                newEnd = snap.ms;
            }
        }

        const newDuration = Math.max(MIN_DURATION_MS, newEnd - resizeSceneStartMs);
        projectStore.updateScene(resizeSceneId, { duration_ms: Math.round(newDuration) });
    }

    function handleResizeEnd() {
        historyStore.endBatch();
        isResizing = false;
        resizeSceneId = null;

        window.removeEventListener('mousemove', handleResizeMove);
        window.removeEventListener('mouseup', handleResizeEnd);
    }

    onDestroy(() => {
        if (isResizing) {
            historyStore.endBatch();
        }
        window.removeEventListener('mousemove', handleResizeMove);
        window.removeEventListener('mouseup', handleResizeEnd);
    });
</script>

<div class="flex h-24 border-b bg-muted/30">
    <div class="flex w-32 shrink-0 items-center border-r bg-background px-2">
        <span class="text-xs text-muted-foreground">Scenes</span>
    </div>
    <div
        class="flex flex-1 items-center overflow-x-auto px-2 py-2 transition-colors {isDragOverStrip ? 'bg-primary/10 ring-2 ring-primary ring-inset' : ''}"
        ondragover={handleStripDragOver}
        ondragleave={handleStripDragLeave}
        ondrop={handleStripDrop}
        role="list"
    >
        <div
            class="relative flex h-16 shrink-0 cursor-pointer"
            style:width="{timelineWidth}px"
            onpointerdown={handleTimelinePointerDown}
            onpointermove={handleTimelinePointerMove}
            onpointerup={handleTimelinePointerUp}
            onlostpointercapture={handleTimelinePointerUp}
            role="slider"
            aria-label="Scene timeline scrubber"
            aria-valuemin="0"
            aria-valuemax={totalDuration}
            aria-valuenow={timelineStore.currentTimeMs}
            tabindex="0"
        >
            <TimelinePlayhead />
            {#each scenes as scene, index (scene.id)}
                <div
                    class="flex-shrink-0 border-r border-background/80 last:border-r-0"
                    role="listitem"
                    draggable={!isResizing}
                    ondragstart={(e) => handleDragStart(e, index)}
                    ondragover={(e) => handleDragOver(e, index)}
                    ondrop={(e) => handleDrop(e, index)}
                    ondragend={handleDragEnd}
                >
                    <SceneCard
                        {scene}
                        {index}
                        {assets}
                        isSelected={scene.id === selectedSceneId}
                        isPlaying={isPlaying && index === playingSceneIndex}
                        width={getSceneWidth(scene)}
                        minWidth={MIN_WIDTH}
                        onclick={() => handleSceneClick(scene)}
                        onResizeStart={(e) => handleResizeStart(e, scene)}
                    />
                </div>
            {/each}
        </div>

        <Button variant="outline" size="icon" class="ml-2 h-16 w-24 flex-shrink-0" onclick={addScene}>
            <Plus class="h-6 w-6" />
        </Button>
    </div>
</div>
