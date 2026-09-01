import type { Project, Selection } from '@/types';

/**
 * Pure selection rules. The store applies these in response to project
 * mutations and playhead movement; keeping them here means the behaviour is
 * unit-testable and no component ever writes to the selection store from an
 * effect.
 */

export const EMPTY_SELECTION: Selection = Object.freeze({
    type: null,
    sceneId: null,
    layerId: null,
    audioTrackId: null,
    audioClipId: null,
    videoTrackId: null,
    videoClipId: null,
}) as Selection;

export function sceneSelection(sceneId: string): Selection {
    return { ...EMPTY_SELECTION, type: 'scene', sceneId };
}

export function layerSelection(sceneId: string, layerId: string): Selection {
    return { ...EMPTY_SELECTION, type: 'layer', sceneId, layerId };
}

export function audioClipSelection(trackId: string, clipId: string): Selection {
    return { ...EMPTY_SELECTION, type: 'audio_clip', audioTrackId: trackId, audioClipId: clipId };
}

export function videoClipSelection(trackId: string, clipId: string): Selection {
    return { ...EMPTY_SELECTION, type: 'video_clip', videoTrackId: trackId, videoClipId: clipId };
}

export function videoTrackSelection(trackId: string): Selection {
    return { ...EMPTY_SELECTION, type: 'video_track', videoTrackId: trackId };
}

export function audioTrackSelection(trackId: string): Selection {
    return { ...EMPTY_SELECTION, type: 'audio_track', audioTrackId: trackId };
}

export function selectionsEqual(a: Selection, b: Selection): boolean {
    return (
        a.type === b.type &&
        a.sceneId === b.sceneId &&
        a.layerId === b.layerId &&
        a.audioTrackId === b.audioTrackId &&
        a.audioClipId === b.audioClipId &&
        a.videoTrackId === b.videoTrackId &&
        a.videoClipId === b.videoClipId
    );
}

/**
 * Resolve a selection against the current project, degrading gracefully when
 * what it points at no longer exists:
 *
 * - a missing layer falls back to its scene,
 * - a missing scene falls back to the first scene (or nothing),
 * - a missing clip or track clears the selection.
 *
 * Returns the input object itself when nothing needs to change, so callers can
 * compare by identity.
 */
export function reconcileSelection(selection: Selection, project: Project | null): Selection {
    if (!project || selection.type === null) return selection;

    switch (selection.type) {
        case 'scene':
        case 'layer': {
            const scene = project.scenes.find((s) => s.id === selection.sceneId);
            if (!scene) {
                return project.scenes.length > 0 ? sceneSelection(project.scenes[0].id) : EMPTY_SELECTION;
            }
            if (selection.type === 'layer' && !scene.layers.some((l) => l.id === selection.layerId)) {
                return sceneSelection(scene.id);
            }
            return selection;
        }
        case 'audio_clip': {
            const track = project.audio_tracks.find((t) => t.id === selection.audioTrackId);
            return track?.clips.some((c) => c.id === selection.audioClipId) ? selection : EMPTY_SELECTION;
        }
        case 'video_clip': {
            const track = project.video_tracks.find((t) => t.id === selection.videoTrackId);
            return track?.clips.some((c) => c.id === selection.videoClipId) ? selection : EMPTY_SELECTION;
        }
        case 'audio_track':
            return project.audio_tracks.some((t) => t.id === selection.audioTrackId) ? selection : EMPTY_SELECTION;
        case 'video_track':
            return project.video_tracks.some((t) => t.id === selection.videoTrackId) ? selection : EMPTY_SELECTION;
        default:
            return selection;
    }
}

/**
 * When the playhead sits in a different scene than the selected one, a scene
 * or layer selection follows the playhead (the canvas shows the playhead's
 * scene, so the inspector should too). Clip selections carry no scene and are
 * never touched. Returns the input when unchanged.
 */
export function followPlayhead(selection: Selection, currentSceneId: string | null): Selection {
    if (!currentSceneId) return selection;
    if (selection.type !== 'scene' && selection.type !== 'layer') return selection;
    if (selection.sceneId === currentSceneId) return selection;

    return sceneSelection(currentSceneId);
}
