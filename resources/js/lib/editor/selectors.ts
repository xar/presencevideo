import type { Asset, AudioClip, Layer, Project, Scene, Selection, VideoClip } from '@/types';
import { sceneStartsMs, totalDurationMs } from './model/timeline';

export function getAssetById(project: Project | null | undefined, assetId: number | null | undefined): Asset | null {
    if (!project || !assetId) return null;

    return (project.assets ?? []).find((asset) => asset.id === assetId) ?? null;
}

export function getSceneById(project: Project | null | undefined, sceneId: string | null | undefined): Scene | null {
    if (!project || !sceneId) return null;

    return project.scenes.find((scene) => scene.id === sceneId) ?? null;
}

export function getLayerById(project: Project | null | undefined, sceneId: string | null | undefined, layerId: string | null | undefined): Layer | null {
    return getSceneById(project, sceneId)?.layers.find((layer) => layer.id === layerId) ?? null;
}

export function getAudioClipById(project: Project | null | undefined, trackId: string | null | undefined, clipId: string | null | undefined): { trackId: string; clip: AudioClip } | null {
    if (!project || !trackId || !clipId) return null;

    const track = project.audio_tracks.find((candidate) => candidate.id === trackId);
    const clip = track?.clips.find((candidate) => candidate.id === clipId);

    return track && clip ? { trackId: track.id, clip } : null;
}

export function getVideoClipById(project: Project | null | undefined, trackId: string | null | undefined, clipId: string | null | undefined): { trackId: string; clip: VideoClip } | null {
    if (!project || !trackId || !clipId) return null;

    const track = project.video_tracks.find((candidate) => candidate.id === trackId);
    const clip = track?.clips.find((candidate) => candidate.id === clipId);

    return track && clip ? { trackId: track.id, clip } : null;
}

export function getSelectedScene(project: Project | null | undefined, selection: Selection): Scene | null {
    return getSceneById(project, selection.sceneId);
}

export function getSelectedLayer(project: Project | null | undefined, selection: Selection): Layer | null {
    return getLayerById(project, selection.sceneId, selection.layerId);
}

/**
 * Total OUTPUT duration of the project, in ms.
 *
 * Delegates to the timeline model, which subtracts transition overlap. Summing
 * raw scene durations — what this used to do, and what the playback clock, the
 * ruler and the snapping code each re-implemented — made the preview run longer
 * than the file it exported, by the total of every transition.
 */
export function getTotalDurationMs(project: Project | null | undefined): number {
    return totalDurationMs(project);
}

/**
 * Absolute start of every scene, in project order.
 *
 * Scene-start arithmetic was re-implemented in seven places, each summing raw
 * durations; this is the single source of truth and it is transition-aware.
 */
export function getSceneStartsMs(project: Project | null | undefined): number[] {
    return sceneStartsMs(project?.scenes ?? [], project?.fps ?? 30);
}

/** Absolute start of one scene, or 0 when it is not in the project. */
export function getSceneStartMs(
    project: Project | null | undefined,
    sceneId: string | null | undefined,
): number {
    const index = (project?.scenes ?? []).findIndex((scene) => scene.id === sceneId);

    return index === -1 ? 0 : getSceneStartsMs(project)[index];
}

/** Index of the scene that contains an absolute time, or -1 when there are none. */
export function getSceneIndexAtMs(project: Project | null | undefined, timeMs: number): number {
    const scenes = project?.scenes ?? [];
    if (scenes.length === 0) {
        return -1;
    }

    const starts = getSceneStartsMs(project);
    for (let index = 0; index < scenes.length; index++) {
        if (timeMs < starts[index] + scenes[index].duration_ms) {
            return index;
        }
    }

    return scenes.length - 1;
}

/** Every scene boundary, for rulers and snapping. */
export function getSceneBoundariesMs(project: Project | null | undefined): number[] {
    const scenes = project?.scenes ?? [];
    const starts = getSceneStartsMs(project);

    return scenes.map((scene, index) => starts[index] + scene.duration_ms);
}

export function getAssetPreviewUrl(asset: Asset | null | undefined): string | null {
    return asset?.thumbnail_url ?? asset?.url ?? null;
}
