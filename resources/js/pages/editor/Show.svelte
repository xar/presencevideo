<script lang="ts">
    import { onMount } from 'svelte';
    import AppHead from '@/components/AppHead.svelte';
    import AssetPanel from '@/components/editor/AssetPanel.svelte';
    import AudioPlayback from '@/components/editor/AudioPlayback.svelte';
    import AudioTracks from '@/components/editor/AudioTracks.svelte';
    import EditorToolbar from '@/components/editor/EditorToolbar.svelte';
    import PreviewPlayer from '@/components/editor/PreviewPlayer.svelte';
    import RightPanel from '@/components/editor/RightPanel.svelte';
    import SceneEditor from '@/components/editor/SceneEditor.svelte';
    import SceneStrip from '@/components/editor/SceneStrip.svelte';
    import VideoTracks from '@/components/editor/VideoTracks.svelte';
    import { projectStore, timelineStore, selectionStore } from '@/lib/editor';
    import type { Project } from '@/types';

    let { project }: { project: Project } = $props();

    // Sync assets from server when they change (e.g., after generation completes)
    $effect(() => {
        if (project.assets && projectStore.project) {
            projectStore.syncAssets(project.assets);
        }
    });

    onMount(() => {
        projectStore.setProject(project);

        if (project.scenes.length > 0) {
            selectionStore.selectScene(project.scenes[0].id);
        }

        function isEditableElement(el: Element | null): boolean {
            if (!el) return false;
            const tagName = el.tagName;
            if (tagName === 'INPUT' || tagName === 'TEXTAREA') return true;
            if ((el as HTMLElement).isContentEditable) return true;
            return false;
        }

        function handleKeydown(e: KeyboardEvent) {
            const inEditable = isEditableElement(document.activeElement);

            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (inEditable) return;
                selectionStore.deleteSelected();
            }

            if (e.key === ' ') {
                if (inEditable) return;
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
                <RightPanel />
            </div>

            <PreviewPlayer />
        </div>
    </div>

    <div class="flex flex-col border-t">
        <SceneStrip />
        <VideoTracks />
        <AudioTracks />
    </div>

    <!-- Audio playback manager (no visual output) -->
    <AudioPlayback />
</div>
