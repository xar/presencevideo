import { projectStore, selectionStore } from '@/lib/editor';
import type { Asset } from '@/types';

export function addVisualAssetToSelectedScene(asset: Asset): void {
    const selectedScene = selectionStore.getSelectedScene();
    if (!selectedScene || asset.type === 'audio') return;

    const project = projectStore.project;
    if (!project) return;

    const layer = projectStore.addLayer(selectedScene.id, {
        type: asset.type,
        asset_id: asset.id,
        x: 0,
        y: 0,
        width: asset.width ?? project.resolution_width,
        height: asset.height ?? project.resolution_height,
    });

    selectionStore.selectLayer(selectedScene.id, layer.id);
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
    });
}
