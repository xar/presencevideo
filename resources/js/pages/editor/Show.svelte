<script lang="ts">
    import { onMount } from 'svelte';
    import AppHead from '@/components/AppHead.svelte';
    import type { Project } from '@/types';
    import { projectStore, timelineStore, selectionStore } from '@/lib/editor';
    import EditorToolbar from '@/components/editor/EditorToolbar.svelte';
    import SceneStrip from '@/components/editor/SceneStrip.svelte';
    import SceneEditor from '@/components/editor/SceneEditor.svelte';
    import PreviewPlayer from '@/components/editor/PreviewPlayer.svelte';
    import AssetPanel from '@/components/editor/AssetPanel.svelte';
    import AudioTracks from '@/components/editor/AudioTracks.svelte';
    import PipelinePanel from '@/components/editor/PipelinePanel.svelte';

    let { project }: { project: Project } = $props();

    onMount(() => {
        projectStore.setProject(project);

        if (project.scenes.length > 0) {
            selectionStore.selectScene(project.scenes[0].id);
        }

        function handleKeydown(e: KeyboardEvent) {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (document.activeElement?.tagName === 'INPUT') return;
                selectionStore.deleteSelected();
            }

            if (e.key === ' ' && document.activeElement?.tagName !== 'INPUT') {
                e.preventDefault();
                timelineStore.togglePlayback();
            }

            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                projectStore.save();
            }
        }

        window.addEventListener('keydown', handleKeydown);

        return () => {
            window.removeEventListener('keydown', handleKeydown);
        };
    });
</script>

<AppHead title={project.name} />

<div class="flex h-screen flex-col bg-background">
    <EditorToolbar />

    <div class="flex flex-1 overflow-hidden">
        <AssetPanel />

        <div class="flex flex-1 flex-col overflow-hidden">
            <div class="flex flex-1 overflow-hidden">
                <SceneEditor />
                <PipelinePanel />
            </div>

            <PreviewPlayer />
        </div>
    </div>

    <div class="flex flex-col border-t">
        <SceneStrip />
        <AudioTracks />
    </div>
</div>
