<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
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
    import { projectStore, timelineStore, selectionStore, generationTracker } from '@/lib/editor';
    import { historyStore } from '@/lib/editor/history.svelte';
    import type { Project, Generation } from '@/types';

    let { project, activeGenerations = [] }: { project: Project; activeGenerations?: Generation[] } = $props();

    // Sync assets from server when they change (e.g., after generation completes)
    $effect(() => {
        if (project.assets && projectStore.project) {
            projectStore.syncAssets(project.assets);
        }
    });

    // Validate selection after project mutations (e.g., scene/layer deleted externally)
    $effect(() => {
        if (projectStore.project) {
            selectionStore.validateSelection();
        }
    });

    // Autosave every 30s when dirty
    $effect(() => {
        if (!projectStore.isDirty) return;

        const timer = setTimeout(() => {
            projectStore.save().catch(() => {});
        }, 30_000);

        return () => clearTimeout(timer);
    });

    onMount(() => {
        projectStore.setProject(project);
        generationTracker.init(activeGenerations);

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

            // Undo: Cmd+Z
            if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
                if (inEditable) return;
                e.preventDefault();
                historyStore.undo();
            }

            // Redo: Cmd+Shift+Z
            if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
                if (inEditable) return;
                e.preventDefault();
                historyStore.redo();
            }

            // Tool shortcuts
            if (!inEditable) {
                if (e.key === 'v' || e.key === 'V') {
                    selectionStore.setTool('select');
                }
                if (e.key === 't' || e.key === 'T') {
                    selectionStore.setTool('text');
                }
                if (e.key === 'h' || e.key === 'H') {
                    selectionStore.setTool('pan');
                }
            }
        }

        // Warn about unsaved changes on navigation
        function handleBeforeUnload(e: BeforeUnloadEvent) {
            if (projectStore.isDirty) {
                e.preventDefault();
            }
        }

        window.addEventListener('keydown', handleKeydown);
        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('keydown', handleKeydown);
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    });

    onDestroy(() => {
        generationTracker.cleanup();
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
