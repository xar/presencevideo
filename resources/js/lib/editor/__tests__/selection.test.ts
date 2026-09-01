import { beforeEach, describe, expect, it } from 'vitest';
import { historyStore } from '../history.svelte';
import { projectStore } from '../project.svelte';
import {
    EMPTY_SELECTION,
    followPlayhead,
    layerSelection,
    reconcileSelection,
    sceneSelection,
    videoClipSelection,
    videoTrackSelection,
} from '../selection-rules';
import { selectionStore } from '../selection.svelte';
import { timelineStore } from '../timeline.svelte';
import { makeProject, makeScene, makeTextLayer, makeVideoClip, makeVideoTrack } from './fixtures';

describe('selection rules', () => {
    const layer = makeTextLayer();
    const sceneA = makeScene({ layers: [layer] });
    const sceneB = makeScene();
    const clip = makeVideoClip();
    const track = makeVideoTrack({ clips: [clip] });
    const project = makeProject({ scenes: [sceneA, sceneB], video_tracks: [track] });

    it('keeps valid selections by identity', () => {
        const sel = layerSelection(sceneA.id, layer.id);
        expect(reconcileSelection(sel, project)).toBe(sel);
        const clipSel = videoClipSelection(track.id, clip.id);
        expect(reconcileSelection(clipSel, project)).toBe(clipSel);
    });

    it('degrades a missing layer to its scene and a missing scene to the first scene', () => {
        expect(reconcileSelection(layerSelection(sceneA.id, 'gone'), project)).toEqual(sceneSelection(sceneA.id));
        expect(reconcileSelection(sceneSelection('gone'), project)).toEqual(sceneSelection(sceneA.id));
        expect(reconcileSelection(sceneSelection('gone'), makeProject({ scenes: [] }))).toEqual(EMPTY_SELECTION);
    });

    it('clears a missing clip', () => {
        expect(reconcileSelection(videoClipSelection(track.id, 'gone'), project)).toEqual(EMPTY_SELECTION);
        expect(reconcileSelection(videoClipSelection('gone', clip.id), project)).toEqual(EMPTY_SELECTION);
    });

    it('keeps a track selection while the track exists and clears it otherwise', () => {
        const sel = videoTrackSelection(track.id);
        expect(reconcileSelection(sel, project)).toBe(sel);
        expect(reconcileSelection(videoTrackSelection('gone'), project)).toEqual(EMPTY_SELECTION);
        expect(followPlayhead(sel, sceneB.id)).toBe(sel);
    });

    it('follows the playhead only for scene and layer selections', () => {
        expect(followPlayhead(sceneSelection(sceneA.id), sceneB.id)).toEqual(sceneSelection(sceneB.id));
        expect(followPlayhead(layerSelection(sceneA.id, layer.id), sceneB.id)).toEqual(sceneSelection(sceneB.id));

        const clipSel = videoClipSelection(track.id, clip.id);
        expect(followPlayhead(clipSel, sceneB.id)).toBe(clipSel);

        const same = sceneSelection(sceneB.id);
        expect(followPlayhead(same, sceneB.id)).toBe(same);
        expect(followPlayhead(same, null)).toBe(same);
    });
});

describe('selectionStore integration', () => {
    let sceneA: ReturnType<typeof makeScene>;
    let sceneB: ReturnType<typeof makeScene>;
    let clip: ReturnType<typeof makeVideoClip>;
    let track: ReturnType<typeof makeVideoTrack>;

    beforeEach(() => {
        sceneA = makeScene({ duration_ms: 1000, layers: [makeTextLayer()] });
        sceneB = makeScene({ duration_ms: 1000 });
        clip = makeVideoClip({ start_ms: 0, duration_ms: 2000 });
        track = makeVideoTrack({ clips: [clip] });
        projectStore.setProject(makeProject({ scenes: [sceneA, sceneB], video_tracks: [track] }));
        historyStore.clear();
        timelineStore.setCurrentTime(0);
        selectionStore.selectScene(sceneA.id);
    });

    it('a clip selection survives mutations and playhead movement', () => {
        selectionStore.selectVideoClip(track.id, clip.id);

        projectStore.updateVideoClip(track.id, clip.id, { start_ms: 10 });
        expect(selectionStore.selection.type).toBe('video_clip');

        timelineStore.setCurrentTime(1500); // crosses into scene B
        expect(selectionStore.selection).toMatchObject({ type: 'video_clip', videoClipId: clip.id });
    });

    it('scene and layer selections follow the playhead across scene boundaries', () => {
        selectionStore.selectLayer(sceneA.id, sceneA.layers[0].id);

        timelineStore.setCurrentTime(1500);
        expect(selectionStore.selection).toMatchObject({ type: 'scene', sceneId: sceneB.id });

        timelineStore.setCurrentTime(1600); // same scene: no churn
        expect(selectionStore.selection).toMatchObject({ type: 'scene', sceneId: sceneB.id });
    });

    it('reconciles stale ids after a delete and after undo', () => {
        selectionStore.selectVideoClip(track.id, clip.id);
        projectStore.deleteVideoClip(track.id, clip.id);
        expect(selectionStore.selection.type).toBe(null);

        selectionStore.selectLayer(sceneA.id, sceneA.layers[0].id);
        projectStore.deleteLayer(sceneA.id, sceneA.layers[0].id);
        expect(selectionStore.selection).toMatchObject({ type: 'scene', sceneId: sceneA.id });

        historyStore.undo(); // layer is back; selection stays on the scene
        expect(projectStore.project!.scenes[0].layers).toHaveLength(1);
        expect(selectionStore.selection).toMatchObject({ type: 'scene', sceneId: sceneA.id });
    });

    it('a scene selected without seeking is not clobbered', () => {
        timelineStore.setCurrentTime(0);
        selectionStore.selectScene(sceneB.id);
        expect(selectionStore.selection.sceneId).toBe(sceneB.id);
    });

    it('deletes and reorders tracks through the selection and project stores', () => {
        const second = projectStore.addVideoTrack();
        expect(projectStore.project!.video_tracks.map((t) => t.id)).toEqual([track.id, second.id]);

        projectStore.moveVideoTrack(second.id, -1);
        expect(projectStore.project!.video_tracks.map((t) => t.id)).toEqual([second.id, track.id]);
        projectStore.moveVideoTrack(second.id, -1); // already first: no-op
        expect(projectStore.project!.video_tracks[0].id).toBe(second.id);

        selectionStore.selectVideoTrack(second.id);
        expect(selectionStore.selection).toMatchObject({ type: 'video_track', videoTrackId: second.id });
        selectionStore.deleteSelected();
        expect(projectStore.project!.video_tracks.map((t) => t.id)).toEqual([track.id]);
        expect(selectionStore.selection.type).toBe(null);

        historyStore.undo();
        expect(projectStore.project!.video_tracks).toHaveLength(2);
    });
});
