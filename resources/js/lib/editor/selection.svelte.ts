import type { Selection, Tool, Layer, AudioClip, Scene } from '@/types';
import { projectStore } from './project.svelte';

export type SelectionStore = {
    selection: Selection;
    tool: Tool;
    selectScene: (sceneId: string) => void;
    selectLayer: (sceneId: string, layerId: string) => void;
    selectAudioClip: (trackId: string, clipId: string) => void;
    clearSelection: () => void;
    setTool: (tool: Tool) => void;
    getSelectedScene: () => Scene | null;
    getSelectedLayer: () => Layer | null;
    getSelectedAudioClip: () => { trackId: string; clip: AudioClip } | null;
    deleteSelected: () => void;
};

let selection = $state<Selection>({
    type: null,
    sceneId: null,
    layerId: null,
    audioTrackId: null,
    audioClipId: null,
});

let tool = $state<Tool>('select');

function selectScene(sceneId: string): void {
    selection = {
        type: 'scene',
        sceneId,
        layerId: null,
        audioTrackId: null,
        audioClipId: null,
    };
}

function selectLayer(sceneId: string, layerId: string): void {
    selection = {
        type: 'layer',
        sceneId,
        layerId,
        audioTrackId: null,
        audioClipId: null,
    };
}

function selectAudioClip(trackId: string, clipId: string): void {
    selection = {
        type: 'audio_clip',
        sceneId: null,
        layerId: null,
        audioTrackId: trackId,
        audioClipId: clipId,
    };
}

function clearSelection(): void {
    selection = {
        type: null,
        sceneId: null,
        layerId: null,
        audioTrackId: null,
        audioClipId: null,
    };
}

function setTool(newTool: Tool): void {
    tool = newTool;
}

function getSelectedScene(): Scene | null {
    const project = projectStore.project;
    if (!project || !selection.sceneId) return null;
    return project.scenes.find((s) => s.id === selection.sceneId) ?? null;
}

function getSelectedLayer(): Layer | null {
    const project = projectStore.project;
    if (!project || !selection.sceneId || !selection.layerId) return null;

    const scene = project.scenes.find((s) => s.id === selection.sceneId);
    if (!scene) return null;

    return scene.layers.find((l) => l.id === selection.layerId) ?? null;
}

function getSelectedAudioClip(): { trackId: string; clip: AudioClip } | null {
    const project = projectStore.project;
    if (!project || !selection.audioTrackId || !selection.audioClipId) return null;

    const track = project.audio_tracks.find((t) => t.id === selection.audioTrackId);
    if (!track) return null;

    const clip = track.clips.find((c) => c.id === selection.audioClipId);
    if (!clip) return null;

    return { trackId: track.id, clip };
}

function deleteSelected(): void {
    if (selection.type === 'scene' && selection.sceneId) {
        projectStore.deleteScene(selection.sceneId);
        clearSelection();
    } else if (selection.type === 'layer' && selection.sceneId && selection.layerId) {
        projectStore.deleteLayer(selection.sceneId, selection.layerId);
        clearSelection();
    } else if (selection.type === 'audio_clip' && selection.audioTrackId && selection.audioClipId) {
        projectStore.deleteAudioClip(selection.audioTrackId, selection.audioClipId);
        clearSelection();
    }
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
        clearSelection,
        setTool,
        getSelectedScene,
        getSelectedLayer,
        getSelectedAudioClip,
        deleteSelected,
    };
}

export const selectionStore = createSelectionStore();
