<script lang="ts">
    import { projectStore, selectionStore } from '@/lib/editor';
    import LayerItem from './LayerItem.svelte';
    import type { Scene, Layer } from '@/types';

    let selectedScene = $derived(selectionStore.getSelectedScene());
    let project = $derived(projectStore.project);

    let canvasScale = $state(0.5);
    let containerEl: HTMLDivElement;

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
        if (selectedScene) {
            selectionStore.selectLayer(selectedScene.id, layer.id);
        }
    }

    function handleCanvasClick() {
        if (selectedScene) {
            selectionStore.selectScene(selectedScene.id);
        }
    }

    function handleLayerUpdate(layer: Layer, updates: Partial<Layer>) {
        if (selectedScene) {
            projectStore.updateLayer(selectedScene.id, layer.id, updates);
        }
    }
</script>

<div
    bind:this={containerEl}
    class="relative flex flex-1 items-center justify-center overflow-hidden bg-muted/50 p-6"
>
    {#if selectedScene && project}
        <div
            class="relative overflow-hidden rounded-lg shadow-lg"
            style:width="{project.resolution_width * canvasScale}px"
            style:height="{project.resolution_height * canvasScale}px"
            style:background-color={selectedScene.background_color ?? '#000'}
            onclick={handleCanvasClick}
            onkeydown={() => {}}
            role="button"
            tabindex="0"
        >
            {#each selectedScene.layers.sort((a, b) => a.z_index - b.z_index) as layer (layer.id)}
                <LayerItem
                    {layer}
                    scale={canvasScale}
                    isSelected={selectionStore.selection.layerId === layer.id}
                    onclick={(e) => handleLayerClick(layer, e)}
                    onUpdate={(updates) => handleLayerUpdate(layer, updates)}
                />
            {/each}
        </div>
    {:else}
        <div class="flex flex-col items-center justify-center text-muted-foreground">
            <p>Select a scene to edit</p>
        </div>
    {/if}
</div>
