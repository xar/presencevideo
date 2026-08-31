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
    import ShortcutsDialog from '@/components/editor/ShortcutsDialog.svelte';
    import TimelineRuler from '@/components/editor/TimelineRuler.svelte';
    import VideoTracks from '@/components/editor/VideoTracks.svelte';
    import { projectStore, timelineStore, selectionStore, generationTracker } from '@/lib/editor';
    import { historyStore } from '@/lib/editor/history.svelte';
    import type { Project, Generation } from '@/types';

    let { project, activeGenerations = [] }: { project: Project; activeGenerations?: Generation[] } = $props();

    let jsonEditorOpen = $state(false);
    let shortcutsOpen = $state(false);

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
            const mod = e.metaKey || e.ctrlKey;

            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (inEditable) return;
                selectionStore.deleteSelected();
            }

            if (e.key === ' ') {
                if (inEditable) return;
                e.preventDefault();
                timelineStore.togglePlayback();
            }

            if (e.key === 'Escape' && !inEditable) {
                selectionStore.clearSelection();
                selectionStore.setTool('select');
            }

            if (mod && e.key === 's') {
                e.preventDefault();
                projectStore.save();
            }

            // Duplicate selected scene/layer/clip: Cmd+D
            if (mod && e.key === 'd') {
                if (inEditable) return;
                e.preventDefault();
                selectionStore.duplicateSelected();
            }

            // JSON Code Editor: Cmd+Shift+E
            if (mod && e.shiftKey && e.key === 'e') {
                e.preventDefault();
                jsonEditorOpen = !jsonEditorOpen;
            }

            // Undo: Cmd+Z
            if (mod && e.key === 'z' && !e.shiftKey) {
                if (inEditable) return;
                e.preventDefault();
                historyStore.undo();
            }

            // Redo: Cmd+Shift+Z or Ctrl+Y
            if (mod && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
                if (inEditable) return;
                e.preventDefault();
                historyStore.redo();
            }

            // Arrow keys: nudge selection (1px, Shift = 10px), or seek the
            // timeline when nothing movable is selected
            if (!inEditable && !mod && e.key.startsWith('Arrow')) {
                const step = e.shiftKey ? 10 : 1;
                const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
                const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;

                if (selectionStore.nudgeSelected(dx, dy)) {
                    e.preventDefault();
                } else if (dx !== 0) {
                    e.preventDefault();
                    const seekMs = e.shiftKey ? 1000 : 100;
                    timelineStore.setCurrentTime(
                        timelineStore.currentTimeMs + Math.sign(dx) * seekMs,
                    );
                }
            }

            // Home/End: jump to timeline start/end
            if (!inEditable && e.key === 'Home') {
                e.preventDefault();
                timelineStore.setCurrentTime(0);
            }
            if (!inEditable && e.key === 'End') {
                e.preventDefault();
                timelineStore.setCurrentTime(timelineStore.getTotalDuration());
            }

            // Shortcuts help: ?
            if (!inEditable && !mod && e.key === '?') {
                e.preventDefault();
                shortcutsOpen = !shortcutsOpen;
            }

            // Split selected clip at playhead: S
            if (!inEditable && !mod && !e.altKey && (e.key === 's' || e.key === 'S')) {
                e.preventDefault();
                selectionStore.splitSelectedAtPlayhead();
            }

            // Tool shortcuts (plain keypress only — don't hijack Cmd+V paste etc.)
            if (!inEditable && !mod && !e.altKey) {
                if (e.key === 'v' || e.key === 'V') {
                    selectionStore.setTool('select');
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

        // Best-effort flush of pending changes when the tab goes to background
        function handleVisibilityChange() {
            if (document.visibilityState === 'hidden' && projectStore.isDirty) {
                projectStore.save().catch(() => {});
            }
        }

        window.addEventListener('keydown', handleKeydown);
        window.addEventListener('beforeunload', handleBeforeUnload);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('keydown', handleKeydown);
            window.removeEventListener('beforeunload', handleBeforeUnload);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    });

    onDestroy(() => {
        generationTracker.cleanup();
    });
</script>

<AppHead title={project.name} />

<div class="flex h-screen flex-col bg-background">
    <EditorToolbar bind:jsonEditorOpen bind:shortcutsOpen />

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
        <TimelineRuler />
        <SceneStrip />
        <VideoTracks />
        <AudioTracks />
    </div>

    <!-- Audio playback manager (no visual output) -->
    <AudioPlayback />

    <ShortcutsDialog bind:open={shortcutsOpen} />
</div>
