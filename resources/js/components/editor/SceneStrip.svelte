<script lang="ts">
    import { projectStore, timelineStore, selectionStore } from '@/lib/editor';
    import { Button } from '@/components/ui/button';
    import { Plus, GripVertical } from 'lucide-svelte';
    import SceneCard from './SceneCard.svelte';
    import type { Scene } from '@/types';

    let scenes = $derived(projectStore.project?.scenes ?? []);
    let selectedSceneId = $derived(selectionStore.selection.sceneId);

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
</script>

<div class="flex h-24 items-center gap-2 overflow-x-auto border-b bg-muted/30 px-4 py-2">
    {#each scenes as scene, index (scene.id)}
        <div
            class="flex-shrink-0"
            draggable="true"
            ondragstart={(e) => handleDragStart(e, index)}
            ondragover={(e) => handleDragOver(e, index)}
            ondrop={(e) => handleDrop(e, index)}
            ondragend={handleDragEnd}
        >
            <SceneCard
                {scene}
                {index}
                isSelected={scene.id === selectedSceneId}
                onclick={() => handleSceneClick(scene)}
            />
        </div>
    {/each}

    <Button variant="outline" size="icon" class="h-16 w-24 flex-shrink-0" onclick={addScene}>
        <Plus class="h-6 w-6" />
    </Button>
</div>
