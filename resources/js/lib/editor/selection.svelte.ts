import { v4 as uuid } from 'uuid';
import type {
    Selection,
    Tool,
    Layer,
    AudioClip,
    VideoClip,
    Scene,
} from '@/types';
import { historyStore } from './history.svelte';
import { projectStore } from './project.svelte';
import { timelineStore } from './timeline.svelte';
import { getAudioClipById, getLayerById, getSceneById, getVideoClipById } from './selectors';

export type SelectionStore = {
    selection: Selection;
    tool: Tool;
    selectScene: (sceneId: string) => void;
    selectLayer: (sceneId: string, layerId: string) => void;
    selectAudioClip: (trackId: string, clipId: string) => void;
    selectVideoClip: (trackId: string, clipId: string) => void;
    clearSelection: () => void;
    setTool: (tool: Tool) => void;
    getSelectedScene: () => Scene | null;
    getSelectedLayer: () => Layer | null;
    getSelectedAudioClip: () => { trackId: string; clip: AudioClip } | null;
    getSelectedVideoClip: () => { trackId: string; clip: VideoClip } | null;
    deleteSelected: () => void;
    duplicateSelected: () => void;
    splitSelectedAtPlayhead: () => void;
    nudgeSelected: (dx: number, dy: number) => boolean;
    validateSelection: () => void;
};

let selection = $state<Selection>({
    type: null,
    sceneId: null,
    layerId: null,
    audioTrackId: null,
    audioClipId: null,
    videoTrackId: null,
    videoClipId: null,
});

let tool = $state<Tool>('select');

/**
 * Validate selection IDs still exist in project — auto-clear stale references.
 * Called imperatively after project mutations since module-level $effect is not allowed.
 */
function validateSelection(): void {
    const p = projectStore.project;
    if (!p || selection.type === null) return;

    if (selection.sceneId) {
        const sceneExists = p.scenes.some((s) => s.id === selection.sceneId);
        if (!sceneExists) {
            if (p.scenes.length > 0) {
                selectScene(p.scenes[0].id);
            } else {
                clearSelection();
            }
            return;
        }

        if (selection.layerId) {
            const scene = p.scenes.find((s) => s.id === selection.sceneId);
            const layerExists = scene?.layers.some(
                (l) => l.id === selection.layerId,
            );
            if (!layerExists) {
                selectScene(selection.sceneId);
                return;
            }
        }
    }

    if (selection.audioTrackId && selection.audioClipId) {
        const track = p.audio_tracks.find(
            (t) => t.id === selection.audioTrackId,
        );
        const clipExists = track?.clips.some(
            (c) => c.id === selection.audioClipId,
        );
        if (!track || !clipExists) {
            clearSelection();
            return;
        }
    }

    if (selection.videoTrackId && selection.videoClipId) {
        const track = p.video_tracks.find(
            (t) => t.id === selection.videoTrackId,
        );
        const clipExists = track?.clips.some(
            (c) => c.id === selection.videoClipId,
        );
        if (!track || !clipExists) {
            clearSelection();
            return;
        }
    }
}

function selectScene(sceneId: string): void {
    selection = {
        type: 'scene',
        sceneId,
        layerId: null,
        audioTrackId: null,
        audioClipId: null,
        videoTrackId: null,
        videoClipId: null,
    };
}

function selectLayer(sceneId: string, layerId: string): void {
    selection = {
        type: 'layer',
        sceneId,
        layerId,
        audioTrackId: null,
        audioClipId: null,
        videoTrackId: null,
        videoClipId: null,
    };
}

function selectAudioClip(trackId: string, clipId: string): void {
    selection = {
        type: 'audio_clip',
        sceneId: null,
        layerId: null,
        audioTrackId: trackId,
        audioClipId: clipId,
        videoTrackId: null,
        videoClipId: null,
    };
}

function selectVideoClip(trackId: string, clipId: string): void {
    selection = {
        type: 'video_clip',
        sceneId: null,
        layerId: null,
        audioTrackId: null,
        audioClipId: null,
        videoTrackId: trackId,
        videoClipId: clipId,
    };
}

function clearSelection(): void {
    selection = {
        type: null,
        sceneId: null,
        layerId: null,
        audioTrackId: null,
        audioClipId: null,
        videoTrackId: null,
        videoClipId: null,
    };
}

function setTool(newTool: Tool): void {
    tool = newTool;
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
        selectScene,
        selectLayer,
        selectAudioClip,
        selectVideoClip,
        clearSelection,
        setTool,
        getSelectedScene,
        getSelectedLayer,
        getSelectedAudioClip,
        getSelectedVideoClip,
        deleteSelected,
        duplicateSelected,
        splitSelectedAtPlayhead,
        nudgeSelected,
        validateSelection,
    };
}

export const selectionStore = createSelectionStore();
