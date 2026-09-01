import { beforeEach, describe, expect, it } from 'vitest';
import type { Asset } from '@/types';
import { addVisualAssetToSelectedScene } from '../asset-actions';
import { historyStore } from '../history.svelte';
import { projectStore } from '../project.svelte';
import { selectionStore } from '../selection.svelte';
import { timelineStore } from '../timeline.svelte';
import { makeProject, makeScene, makeVideoClip, makeVideoTrack } from './fixtures';

const image: Asset = {
    id: 9, user_id: 1, project_id: 1, type: 'image', source: 'upload', name: 'pic.png', path: 'p', disk: 'local',
    mime_type: 'image/png', size_bytes: 1, duration_ms: null, width: 800, height: 600, thumbnail_path: null,
    metadata: {}, created_at: '', updated_at: '', url: '/pic.png',
};

describe('addVisualAssetToSelectedScene', () => {
    let sceneA: ReturnType<typeof makeScene>;
    let sceneB: ReturnType<typeof makeScene>;

    beforeEach(() => {
        sceneA = makeScene({ duration_ms: 1000 });
        sceneB = makeScene({ duration_ms: 1000 });
        const clip = makeVideoClip();
        projectStore.setProject(makeProject({ scenes: [sceneA, sceneB], video_tracks: [makeVideoTrack({ clips: [clip] })], assets: [image] }));
        historyStore.clear();
        selectionStore.selectVideoClip(projectStore.project!.video_tracks[0].id, clip.id);
    });

    it('lands in the playhead scene when a clip (not a scene) is selected', () => {
        timelineStore.setCurrentTime(1500);
        addVisualAssetToSelectedScene(image);

        expect(projectStore.project!.scenes[1].layers).toHaveLength(1);
        expect(projectStore.project!.scenes[1].layers[0]).toMatchObject({ type: 'image', asset_id: 9 });
        expect(selectionStore.selection).toMatchObject({ type: 'layer', sceneId: sceneB.id });
    });

    it('prefers the explicitly selected scene', () => {
        timelineStore.setCurrentTime(1500);
        selectionStore.selectScene(sceneA.id);
        addVisualAssetToSelectedScene(image);

        expect(projectStore.project!.scenes[0].layers).toHaveLength(1);
    });
});
