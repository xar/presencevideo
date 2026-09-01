import { v4 as uuid } from 'uuid';
import type {
    Selection,
    Tool,
    Layer,
    AudioClip,
    AudioTrack,
    VideoClip,
    VideoTrack,
    Scene,
} from '@/types';
import { historyStore } from './history.svelte';
import { projectStore } from './project.svelte';
import {
    EMPTY_SELECTION,
    audioClipSelection,
    audioTrackSelection,
    followPlayhead,
    layerSelection,
    reconcileSelection,
    sceneSelection,
    selectionsEqual,
    videoClipSelection,
    videoTrackSelection,
} from './selection-rules';
import { getAudioClipById, getLayerById, getSceneById, getVideoClipById } from './selectors';
import { timelineStore } from './timeline.svelte';

/**
 * A deep-cloned, project-detached copy of whatever was last copied/cut.
 * `sourceTrackId` lets a clip paste back onto its original track when the
 * current selection does not name one.
 */
export type ClipboardPayload =
    | { kind: 'scene'; data: Scene }
    | { kind: 'layer'; data: Layer }
    | { kind: 'audio_clip'; data: AudioClip; sourceTrackId: string }
    | { kind: 'video_clip'; data: VideoClip; sourceTrackId: string };

export type SelectionStore = {
    selection: Selection;
    tool: Tool;
    clipboard: ClipboardPayload | null;
    canPaste: boolean;
    copySelected: () => boolean;
    cutSelected: () => boolean;
    pasteClipboard: () => boolean;
    selectScene: (sceneId: string) => void;
    selectLayer: (sceneId: string, layerId: string) => void;
    selectAudioClip: (trackId: string, clipId: string) => void;
    selectVideoClip: (trackId: string, clipId: string) => void;
    selectVideoTrack: (trackId: string) => void;
    selectAudioTrack: (trackId: string) => void;
    clearSelection: () => void;
    setTool: (tool: Tool) => void;
    getSelectedScene: () => Scene | null;
    getTargetScene: () => Scene | null;
    getSelectedLayer: () => Layer | null;
    getSelectedAudioClip: () => { trackId: string; clip: AudioClip } | null;
    getSelectedVideoClip: () => { trackId: string; clip: VideoClip } | null;
    getSelectedVideoTrack: () => VideoTrack | null;
    getSelectedAudioTrack: () => AudioTrack | null;
    deleteSelected: () => void;
    duplicateSelected: () => void;
    splitSelectedAtPlayhead: () => void;
    nudgeSelected: (dx: number, dy: number) => boolean;
    validateSelection: () => void;
};

let selection = $state<Selection>({ ...EMPTY_SELECTION });

let tool = $state<Tool>('select');

let clipboard = $state<ClipboardPayload | null>(null);

/**
 * Re-resolve the selection against the project (stale ids after a delete,
 * undo, or external update). Wired to `projectStore.onAfterMutate` below.
 */
function validateSelection(): void {
    applySelection(reconcileSelection(selection, projectStore.project));
}

/** Playhead crossed into another scene: scene/layer selections follow it. */
function followCurrentScene(scene: Scene | null): void {
    applySelection(followPlayhead(selection, scene?.id ?? null));
}

function applySelection(next: Selection): void {
    if (next === selection || selectionsEqual(next, selection)) return;
    selection = { ...next };
}

function selectScene(sceneId: string): void {
    selection = sceneSelection(sceneId);
}

function selectLayer(sceneId: string, layerId: string): void {
    selection = layerSelection(sceneId, layerId);
}

function selectAudioClip(trackId: string, clipId: string): void {
    selection = audioClipSelection(trackId, clipId);
}

function selectVideoClip(trackId: string, clipId: string): void {
    selection = videoClipSelection(trackId, clipId);
}

function selectVideoTrack(trackId: string): void {
    selection = videoTrackSelection(trackId);
}

function selectAudioTrack(trackId: string): void {
    selection = audioTrackSelection(trackId);
}

function getSelectedVideoTrack(): VideoTrack | null {
    if (selection.type !== 'video_track') return null;
    return projectStore.project?.video_tracks.find((t) => t.id === selection.videoTrackId) ?? null;
}

function getSelectedAudioTrack(): AudioTrack | null {
    if (selection.type !== 'audio_track') return null;
    return projectStore.project?.audio_tracks.find((t) => t.id === selection.audioTrackId) ?? null;
}

function clearSelection(): void {
    selection = { ...EMPTY_SELECTION };
}

function setTool(newTool: Tool): void {
    tool = newTool;
}

/**
 * The scene a new element should land in: the selected scene (or the selected
 * layer's scene), else the scene under the playhead, else the first scene.
 * Clip selections carry no scene, so actions must never gate on
 * `getSelectedScene()` alone.
 */
function getTargetScene(): Scene | null {
    return (
        getSelectedScene() ??
        timelineStore.getCurrentScene() ??
        projectStore.project?.scenes[0] ??
        null
    );
}

function getSelectedScene(): Scene | null {
    return getSceneById(projectStore.project, selection.sceneId);
}

function getSelectedLayer(): Layer | null {
    return getLayerById(projectStore.project, selection.sceneId, selection.layerId);
}

function getSelectedAudioClip(): { trackId: string; clip: AudioClip } | null {
    return getAudioClipById(
        projectStore.project,
        selection.audioTrackId,
        selection.audioClipId,
    );
}

function getSelectedVideoClip(): { trackId: string; clip: VideoClip } | null {
    return getVideoClipById(
        projectStore.project,
        selection.videoTrackId,
        selection.videoClipId,
    );
}

function deleteSelected(): void {
    if (selection.type === 'scene' && selection.sceneId) {
        projectStore.deleteScene(selection.sceneId);
        clearSelection();
    } else if (
        selection.type === 'layer' &&
        selection.sceneId &&
        selection.layerId
    ) {
        const sceneId = selection.sceneId;
        projectStore.deleteLayer(sceneId, selection.layerId);
        // Keep scene selected after deleting layer
        selectScene(sceneId);
    } else if (
        selection.type === 'audio_clip' &&
        selection.audioTrackId &&
        selection.audioClipId
    ) {
        projectStore.deleteAudioClip(
            selection.audioTrackId,
            selection.audioClipId,
        );
        clearSelection();
    } else if (
        selection.type === 'video_clip' &&
        selection.videoTrackId &&
        selection.videoClipId
    ) {
        projectStore.deleteVideoClip(
            selection.videoTrackId,
            selection.videoClipId,
        );
        clearSelection();
    } else if (selection.type === 'video_track' && selection.videoTrackId) {
        projectStore.deleteVideoTrack(selection.videoTrackId);
        clearSelection();
    } else if (selection.type === 'audio_track' && selection.audioTrackId) {
        projectStore.deleteAudioTrack(selection.audioTrackId);
        clearSelection();
    }
}

function duplicateSelected(): void {
    const p = projectStore.project;
    if (!p) return;

    if (selection.type === 'scene' && selection.sceneId) {
        const scene = getSceneById(p, selection.sceneId);
        if (!scene) return;

        const index = p.scenes.findIndex((s) => s.id === scene.id);
        const clone = structuredClone($state.snapshot(scene)) as Scene;
        const { id: _id, ...rest } = clone;

        historyStore.beginBatch();
        const newScene = projectStore.addScene({
            ...rest,
            name: `${scene.name} copy`,
            layers: clone.layers.map((layer) => ({ ...layer, id: uuid() })),
        });
        projectStore.reorderScenes(
            projectStore.project!.scenes.length - 1,
            index + 1,
        );
        historyStore.endBatch();

        selectScene(newScene.id);
    } else if (
        selection.type === 'layer' &&
        selection.sceneId &&
        selection.layerId
    ) {
        const layer = getSelectedLayer();
        if (!layer) return;

        const clone = structuredClone($state.snapshot(layer)) as Layer;
        const { id: _id, z_index: _z, ...rest } = clone;

        const newLayer = projectStore.addLayer(selection.sceneId, {
            ...rest,
            x: clone.x + 20,
            y: clone.y + 20,
        } as Partial<Layer>);

        selectLayer(selection.sceneId, newLayer.id);
    } else if (
        selection.type === 'audio_clip' &&
        selection.audioTrackId &&
        selection.audioClipId
    ) {
        const selected = getSelectedAudioClip();
        if (!selected) return;

        const clone = structuredClone($state.snapshot(selected.clip)) as AudioClip;
        const { id: _id, ...rest } = clone;

        const newClip = projectStore.addAudioClip(selected.trackId, {
            ...rest,
            start_ms: clone.start_ms + clone.duration_ms,
        });

        selectAudioClip(selected.trackId, newClip.id);
    } else if (
        selection.type === 'video_clip' &&
        selection.videoTrackId &&
        selection.videoClipId
    ) {
        const selected = getSelectedVideoClip();
        if (!selected) return;

        const clone = structuredClone($state.snapshot(selected.clip)) as VideoClip;
        const { id: _id, ...rest } = clone;

        const newClip = projectStore.addVideoClip(selected.trackId, {
            ...rest,
            start_ms: clone.start_ms + clone.duration_ms,
        });

        selectVideoClip(selected.trackId, newClip.id);
    }
}

/** Detach a piece of project state from its `$state` proxy so it survives edits. */
function snapshotOf<T>(value: T): T {
    return structuredClone($state.snapshot(value)) as T;
}

/**
 * Copy the current selection into the editor's internal clipboard.
 * Returns false when nothing copyable is selected so keyboard callers can let
 * the browser's native copy happen instead.
 */
function copySelected(): boolean {
    if (selection.type === 'scene') {
        const scene = getSelectedScene();
        if (!scene) return false;
        clipboard = { kind: 'scene', data: snapshotOf(scene) };
        return true;
    }

    if (selection.type === 'layer') {
        const layer = getSelectedLayer();
        if (!layer) return false;
        clipboard = { kind: 'layer', data: snapshotOf(layer) };
        return true;
    }

    if (selection.type === 'audio_clip') {
        const selected = getSelectedAudioClip();
        if (!selected) return false;
        clipboard = {
            kind: 'audio_clip',
            data: snapshotOf(selected.clip),
            sourceTrackId: selected.trackId,
        };
        return true;
    }

    if (selection.type === 'video_clip') {
        const selected = getSelectedVideoClip();
        if (!selected) return false;
        clipboard = {
            kind: 'video_clip',
            data: snapshotOf(selected.clip),
            sourceTrackId: selected.trackId,
        };
        return true;
    }

    return false;
}

/** Copy the selection to the clipboard and remove it from the project. */
function cutSelected(): boolean {
    if (!copySelected()) return false;

    historyStore.beginBatch();
    deleteSelected();
    historyStore.endBatch();

    return true;
}

/**
 * Paste the internal clipboard: layers land in the current scene offset by 20px,
 * clips land at the playhead on the selected/original/first suitable track, and
 * scenes are inserted after the selected scene. The new element is selected.
 * Returns false when there is nothing to paste or no valid target.
 */
function pasteClipboard(): boolean {
    const p = projectStore.project;
    if (!p || !clipboard) return false;

    if (clipboard.kind === 'layer') {
        const targetSceneId =
            selection.sceneId ??
            timelineStore.getCurrentScene()?.id ??
            p.scenes[0]?.id ??
            null;
        if (!targetSceneId) return false;

        const { id: _id, z_index: _z, ...rest } = snapshotOf(clipboard.data);
        const newLayer = projectStore.addLayer(targetSceneId, {
            ...rest,
            x: clipboard.data.x + 20,
            y: clipboard.data.y + 20,
        } as Partial<Layer>);

        selectLayer(targetSceneId, newLayer.id);
        return true;
    }

    if (clipboard.kind === 'video_clip') {
        const sourceTrackId = clipboard.sourceTrackId;
        const trackId =
            selection.videoTrackId ??
            (p.video_tracks.some((t) => t.id === sourceTrackId)
                ? sourceTrackId
                : p.video_tracks[0]?.id);

        historyStore.beginBatch();
        const resolvedTrackId = trackId ?? projectStore.addVideoTrack().id;

        const { id: _id, ...rest } = snapshotOf(clipboard.data);
        const newClip = projectStore.addVideoClip(resolvedTrackId, {
            ...rest,
            start_ms: Math.max(0, Math.round(timelineStore.currentTimeMs)),
        });
        historyStore.endBatch();

        selectVideoClip(resolvedTrackId, newClip.id);
        return true;
    }

    if (clipboard.kind === 'audio_clip') {
        const sourceTrackId = clipboard.sourceTrackId;
        const trackId =
            selection.audioTrackId ??
            (p.audio_tracks.some((t) => t.id === sourceTrackId)
                ? sourceTrackId
                : p.audio_tracks[0]?.id);

        historyStore.beginBatch();
        const resolvedTrackId = trackId ?? projectStore.addAudioTrack().id;

        const { id: _id, ...rest } = snapshotOf(clipboard.data);
        const newClip = projectStore.addAudioClip(resolvedTrackId, {
            ...rest,
            start_ms: Math.max(0, Math.round(timelineStore.currentTimeMs)),
        });
        historyStore.endBatch();

        selectAudioClip(resolvedTrackId, newClip.id);
        return true;
    }

    // Scene
    const source = snapshotOf(clipboard.data);
    const { id: _id, ...rest } = source;
    const selectedIndex = selection.sceneId
        ? p.scenes.findIndex((s) => s.id === selection.sceneId)
        : -1;
    const insertAt = selectedIndex === -1 ? p.scenes.length : selectedIndex + 1;

    historyStore.beginBatch();
    const newScene = projectStore.addScene({
        ...rest,
        name: `${source.name} copy`,
        layers: source.layers.map((layer) => ({ ...layer, id: uuid() })),
    });
    projectStore.reorderScenes(projectStore.project!.scenes.length - 1, insertAt);
    historyStore.endBatch();

    selectScene(newScene.id);
    return true;
}

/**
 * Split the selected video/audio clip at the current playhead position into two
 * clips as a single undo step, then select the right-hand clip. No-ops when the
 * selection is not a clip or the playhead is not strictly inside it.
 */
function splitSelectedAtPlayhead(): void {
    const atMs = timelineStore.currentTimeMs;

    if (
        selection.type === 'video_clip' &&
        selection.videoTrackId &&
        selection.videoClipId
    ) {
        const selected = getSelectedVideoClip();
        if (!selected) return;

        const { trackId, clip } = selected;
        if (atMs <= clip.start_ms || atMs >= clip.start_ms + clip.duration_ms) {
            return;
        }

        historyStore.beginBatch();
        const newClip = projectStore.splitVideoClip(trackId, clip.id, atMs);
        historyStore.endBatch();

        if (newClip) {
            selectVideoClip(trackId, newClip.id);
        }
    } else if (
        selection.type === 'audio_clip' &&
        selection.audioTrackId &&
        selection.audioClipId
    ) {
        const selected = getSelectedAudioClip();
        if (!selected) return;

        const { trackId, clip } = selected;
        if (atMs <= clip.start_ms || atMs >= clip.start_ms + clip.duration_ms) {
            return;
        }

        historyStore.beginBatch();
        const newClip = projectStore.splitAudioClip(trackId, clip.id, atMs);
        historyStore.endBatch();

        if (newClip) {
            selectAudioClip(trackId, newClip.id);
        }
    }
}

/**
 * Move the selected element by dx/dy pixels (layers, video clips) or shift
 * the selected audio clip on the timeline (100ms per dx unit).
 * Returns false when nothing movable is selected so callers can fall back
 * to another action (e.g. timeline seeking).
 */
function nudgeSelected(dx: number, dy: number): boolean {
    if (
        selection.type === 'layer' &&
        selection.sceneId &&
        selection.layerId
    ) {
        const layer = getSelectedLayer();
        if (!layer) return false;

        projectStore.updateLayer(selection.sceneId, selection.layerId, {
            x: layer.x + dx,
            y: layer.y + dy,
        });
        return true;
    }

    if (
        selection.type === 'video_clip' &&
        selection.videoTrackId &&
        selection.videoClipId
    ) {
        const selected = getSelectedVideoClip();
        if (!selected) return false;

        projectStore.updateVideoClip(selection.videoTrackId, selection.videoClipId, {
            x: selected.clip.x + dx,
            y: selected.clip.y + dy,
        });
        return true;
    }

    if (
        selection.type === 'audio_clip' &&
        selection.audioTrackId &&
        selection.audioClipId &&
        dx !== 0
    ) {
        const selected = getSelectedAudioClip();
        if (!selected) return false;

        projectStore.updateAudioClip(selection.audioTrackId, selection.audioClipId, {
            start_ms: Math.max(0, selected.clip.start_ms + dx * 100),
        });
        return true;
    }

    return false;
}

export function createSelectionStore(): SelectionStore {
    return {
        get selection() {
            return selection;
        },
        get tool() {
            return tool;
        },
        get clipboard() {
            return clipboard;
        },
        get canPaste() {
            return clipboard !== null;
        },
        copySelected,
        cutSelected,
        pasteClipboard,
        selectScene,
        selectLayer,
        selectAudioClip,
        selectVideoClip,
        selectVideoTrack,
        selectAudioTrack,
        clearSelection,
        setTool,
        getSelectedScene,
        getTargetScene,
        getSelectedLayer,
        getSelectedAudioClip,
        getSelectedVideoClip,
        getSelectedVideoTrack,
        getSelectedAudioTrack,
        deleteSelected,
        duplicateSelected,
        splitSelectedAtPlayhead,
        nudgeSelected,
        validateSelection,
    };
}

export const selectionStore = createSelectionStore();

// Selection reacts to the stores it depends on through explicit hooks rather
// than component effects, so the rules apply no matter which UI is mounted.
projectStore.onAfterMutate(validateSelection);
timelineStore.onCurrentSceneChange(followCurrentScene);
