<script lang="ts">
    import { Plus } from 'lucide-svelte';
    import { Button } from '@/components/ui/button';
    import { projectStore, timelineStore, selectionStore } from '@/lib/editor';
    import type { Scene, ImageLayer, VideoLayer } from '@/types';
    import SceneCard from './SceneCard.svelte';

    const MIN_WIDTH = 48;
    const MIN_DURATION_MS = 500;

    let scenes = $derived(projectStore.project?.scenes ?? []);
    let selectedSceneId = $derived(selectionStore.selection.sceneId);
    let isPlaying = $derived(timelineStore.isPlaying);
    let playingSceneIndex = $derived(timelineStore.getCurrentSceneIndex());
    let pixelsPerMs = $derived(timelineStore.pixelsPerMs);
    let isDragOverStrip = $state(false);

    // Resize state
    let isResizing = $state(false);
    let resizeSceneId = $state<string | null>(null);
    let resizeStartX = $state(0);
    let resizeStartDuration = $state(0);

    function getSceneWidth(scene: Scene): number {
        return Math.max(MIN_WIDTH, scene.duration_ms * pixelsPerMs);
    }

    function addScene() {
        const scene = projectStore.addScene();
        selectionStore.selectScene(scene.id);
    }

    function handleSceneClick(scene: Scene) {
        // Pause playback when clicking a scene
        if (isPlaying) {
            timelineStore.pause();
        }
        selectionStore.selectScene(scene.id);
        const sceneIndex = scenes.findIndex((s) => s.id === scene.id);
        if (sceneIndex >= 0) {
            timelineStore.seekToScene(sceneIndex);
        }
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
            const assetWidth = parsed.width ?? project.resolution_width;
            const assetHeight = parsed.height ?? project.resolution_height;

            // Get asset to check duration for video
            const asset = project.assets?.find(a => a.id === parsed.assetId);
            const sceneDuration = asset?.duration_ms ?? 5000;

            // Create a new scene with the asset as a full-screen layer
            const scene = projectStore.addScene({
                name: asset?.name ?? `Scene ${scenes.length + 1}`,
                duration_ms: sceneDuration,
                layers: [{
                    id: crypto.randomUUID(),
                    type: parsed.assetType,
                    asset_id: parsed.assetId,
                    x: 0,
                    y: 0,
                    width: project.resolution_width,
                    height: project.resolution_height,
                    z_index: 0,
                } as ImageLayer | VideoLayer],
            });

            selectionStore.selectScene(scene.id);
        } catch (err) {
            console.error('Failed to create scene from asset:', err);
        }
    }

    // Resize handlers
    function handleResizeStart(e: MouseEvent, scene: Scene) {
        isResizing = true;
        resizeSceneId = scene.id;
        resizeStartX = e.clientX;
        resizeStartDuration = scene.duration_ms;

        window.addEventListener('mousemove', handleResizeMove);
        window.addEventListener('mouseup', handleResizeEnd);
    }

    function handleResizeMove(e: MouseEvent) {
        if (!isResizing || !resizeSceneId) return;

        const deltaX = e.clientX - resizeStartX;
        const deltaDuration = deltaX / pixelsPerMs;
        const newDuration = Math.max(MIN_DURATION_MS, resizeStartDuration + deltaDuration);
        projectStore.updateScene(resizeSceneId, { duration_ms: Math.round(newDuration) });
    }

    function handleResizeEnd() {
        isResizing = false;
        resizeSceneId = null;

        window.removeEventListener('mousemove', handleResizeMove);
        window.removeEventListener('mouseup', handleResizeEnd);
    }
</script>

<div
    class="flex h-24 items-center gap-2 overflow-x-auto border-b bg-muted/30 px-4 py-2 transition-colors {isDragOverStrip ? 'bg-primary/10 ring-2 ring-primary ring-inset' : ''}"
    ondragover={handleStripDragOver}
    ondragleave={handleStripDragLeave}
    ondrop={handleStripDrop}
    role="list"
>
    {#each scenes as scene, index (scene.id)}
        <div
            class="flex-shrink-0"
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
                isSelected={scene.id === selectedSceneId}
                isPlaying={isPlaying && index === playingSceneIndex}
                width={getSceneWidth(scene)}
                minWidth={MIN_WIDTH}
                onclick={() => handleSceneClick(scene)}
                onResizeStart={(e) => handleResizeStart(e, scene)}
            />
        </div>
    {/each}

    <Button variant="outline" size="icon" class="h-16 w-24 flex-shrink-0" onclick={addScene}>
        <Plus class="h-6 w-6" />
    </Button>
</div>
