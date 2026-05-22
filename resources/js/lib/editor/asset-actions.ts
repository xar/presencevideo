import { projectStore, selectionStore } from '@/lib/editor';
import type { Asset, Project } from '@/types';

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

export function addVisualAssetToSelectedScene(asset: Asset): void {
    const selectedScene = selectionStore.getSelectedScene();
    if (!selectedScene || asset.type === 'audio') return;

    const project = projectStore.project;
    if (!project) return;

    const fit = getCanvasFitDimensions(project, asset);
    const layer = projectStore.addLayer(selectedScene.id, {
        type: asset.type,
        asset_id: asset.id,
        ...fit,
    });

    selectionStore.selectLayer(selectedScene.id, layer.id);
}

export function addVisualAssetAsScene(asset: Asset): void {
    const project = projectStore.project;
    if (!project || asset.type === 'audio') return;

    const fit = getCanvasFitDimensions(project, asset);
    const scene = projectStore.addScene({
        name: asset.name,
        duration_ms:
            asset.type === 'video' ? (asset.duration_ms ?? 5000) : 5000,
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
