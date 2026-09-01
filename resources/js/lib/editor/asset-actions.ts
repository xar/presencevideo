import { projectStore, selectionStore } from '@/lib/editor';
import type { Asset, AssetType, Project } from '@/types';

/** Upper bound for a scene duration derived from a video asset. */
export const MAX_AUTO_SCENE_DURATION_MS = 60_000;

type FitDimensions = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export function getCanvasFitDimensions(
    project: Pick<Project, 'resolution_width' | 'resolution_height'>,
    asset: Pick<Asset, 'width' | 'height'>,
): FitDimensions {
    const canvasWidth = project.resolution_width;
    const canvasHeight = project.resolution_height;
    const assetWidth = asset.width ?? canvasWidth;
    const assetHeight = asset.height ?? canvasHeight;
    const scale = Math.min(
        canvasWidth / assetWidth,
        canvasHeight / assetHeight,
    );
    const width = Math.round(assetWidth * scale);
    const height = Math.round(assetHeight * scale);

    return {
        x: Math.round((canvasWidth - width) / 2),
        y: Math.round((canvasHeight - height) / 2),
        width,
        height,
    };
}

/**
 * The scene duration a freshly dropped asset should imply, or null when the
 * scene's own duration must be left alone.
 *
 * Only an empty scene follows its video: once a scene has layers its duration
 * is a deliberate choice the user made.
 */
export function autoSceneDurationMs(
    assetType: AssetType | string,
    assetDurationMs: number | null | undefined,
    existingLayerCount: number,
): number | null {
    if (assetType !== 'video' || existingLayerCount > 0) return null;
    if (!assetDurationMs || assetDurationMs <= 0) return null;

    return Math.min(MAX_AUTO_SCENE_DURATION_MS, Math.round(assetDurationMs));
}

export function addVisualAssetToSelectedScene(asset: Asset): void {
    const selectedScene = selectionStore.getTargetScene();
    if (!selectedScene || asset.type === 'audio') return;

    const project = projectStore.project;
    if (!project) return;

    const autoDurationMs = autoSceneDurationMs(
        asset.type,
        asset.duration_ms,
        selectedScene.layers.length,
    );

    const fit = getCanvasFitDimensions(project, asset);
    const layer = projectStore.addLayer(selectedScene.id, {
        type: asset.type,
        asset_id: asset.id,
        ...fit,
    });

    if (autoDurationMs !== null) {
        projectStore.updateScene(selectedScene.id, { duration_ms: autoDurationMs });
    }

    selectionStore.selectLayer(selectedScene.id, layer.id);
}

export function addVisualAssetAsScene(asset: Asset): void {
    const project = projectStore.project;
    if (!project || asset.type === 'audio') return;

    const fit = getCanvasFitDimensions(project, asset);
    const scene = projectStore.addScene({
        name: asset.name,
        duration_ms: autoSceneDurationMs(asset.type, asset.duration_ms, 0) ?? 5000,
    });

    const layer = projectStore.addLayer(scene.id, {
        type: asset.type,
        asset_id: asset.id,
        ...fit,
    });

    selectionStore.selectLayer(scene.id, layer.id);
}

export function addAudioAssetToFirstTrack(asset: Asset): void {
    if (!projectStore.project || asset.type !== 'audio') return;

    let targetTrack = projectStore.project.audio_tracks[0];
    if (!targetTrack) {
        targetTrack = projectStore.addAudioTrack();
    }

    const lastClip = targetTrack.clips[targetTrack.clips.length - 1];
    const startMs = lastClip ? lastClip.start_ms + lastClip.duration_ms : 0;

    const clip = projectStore.addAudioClip(targetTrack.id, {
        asset_id: asset.id,
        start_ms: startMs,
        duration_ms: asset.duration_ms ?? 5000,
        volume: 1.0,
    });

    selectionStore.selectAudioClip(targetTrack.id, clip.id);
}

export function addAssetToEditor(asset: Asset): void {
    if (asset.type === 'audio') {
        addAudioAssetToFirstTrack(asset);
        return;
    }

    addVisualAssetToSelectedScene(asset);
}

export function serializeAssetDragData(asset: Asset): string {
    return JSON.stringify({
        type: 'asset',
        assetId: asset.id,
        assetType: asset.type,
        width: asset.width,
        height: asset.height,
        durationMs: asset.duration_ms,
    });
}
