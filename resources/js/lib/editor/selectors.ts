import type { Asset, AudioClip, Layer, Project, Scene, Selection, VideoClip } from '@/types';

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

export function getTotalDurationMs(project: Project | null | undefined): number {
    return project?.scenes.reduce((duration, scene) => duration + scene.duration_ms, 0) ?? 0;
}

export function getAssetPreviewUrl(asset: Asset | null | undefined): string | null {
    return asset?.thumbnail_url ?? asset?.url ?? null;
}
