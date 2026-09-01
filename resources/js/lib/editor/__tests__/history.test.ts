import { beforeEach, describe, expect, it } from 'vitest';
import { historyStore } from '../history.svelte';
import { projectStore } from '../project.svelte';
import { makeProject, makeScene, makeVideoClip, makeVideoTrack } from './fixtures';

function load() {
    const clip = makeVideoClip({ start_ms: 0 });
    const track = makeVideoTrack({ clips: [clip] });
    projectStore.setProject(makeProject({ scenes: [makeScene()], video_tracks: [track] }));
    historyStore.clear();
    return { clip, track };
}

describe('historyStore', () => {
    beforeEach(load);

    it('records one undo step per plain mutation', () => {
        const { clip, track } = load();

        projectStore.updateVideoClip(track.id, clip.id, { start_ms: 100 });
        projectStore.updateVideoClip(track.id, clip.id, { start_ms: 200 });

        expect(projectStore.project!.video_tracks[0].clips[0].start_ms).toBe(200);
        historyStore.undo();
        expect(projectStore.project!.video_tracks[0].clips[0].start_ms).toBe(100);
        historyStore.undo();
        expect(projectStore.project!.video_tracks[0].clips[0].start_ms).toBe(0);
        expect(historyStore.canUndo).toBe(false);
    });

    it('collapses a transaction into a single undo step', () => {
        const { clip, track } = load();

        historyStore.transaction(() => {
            projectStore.updateVideoClip(track.id, clip.id, { start_ms: 100 });
            projectStore.updateVideoClip(track.id, clip.id, { start_ms: 200 });
            projectStore.updateVideoClip(track.id, clip.id, { start_ms: 300 });
        });

        historyStore.undo();
        expect(projectStore.project!.video_tracks[0].clips[0].start_ms).toBe(0);
        expect(historyStore.canUndo).toBe(false);
        expect(historyStore.batchDepth).toBe(0);
    });

    it('closes the batch even when the transaction throws', () => {
        expect(() =>
            historyStore.transaction(() => {
                throw new Error('boom');
            }),
        ).toThrow('boom');

        expect(historyStore.batchDepth).toBe(0);
    });

    it('beginTransaction handles are idempotent', () => {
        const { clip, track } = load();

        const tx = historyStore.beginTransaction();
        projectStore.updateVideoClip(track.id, clip.id, { start_ms: 100 });
        projectStore.updateVideoClip(track.id, clip.id, { start_ms: 200 });
        tx.end();
        tx.end(); // e.g. pointer-up followed by component teardown

        expect(tx.ended).toBe(true);
        expect(historyStore.batchDepth).toBe(0);

        // A later plain mutation must be its own undo step, not swallowed by
        // a batch that was closed twice into negative depth.
        projectStore.updateVideoClip(track.id, clip.id, { start_ms: 300 });
        historyStore.undo();
        expect(projectStore.project!.video_tracks[0].clips[0].start_ms).toBe(200);
        historyStore.undo();
        expect(projectStore.project!.video_tracks[0].clips[0].start_ms).toBe(0);
    });

    it('redo is reachable after undo and cleared by a new mutation', () => {
        const { clip, track } = load();

        projectStore.updateVideoClip(track.id, clip.id, { start_ms: 100 });
        historyStore.undo();
        expect(historyStore.canRedo).toBe(true);
        historyStore.redo();
        expect(projectStore.project!.video_tracks[0].clips[0].start_ms).toBe(100);

        historyStore.undo();
        projectStore.updateVideoClip(track.id, clip.id, { start_ms: 500 });
        expect(historyStore.canRedo).toBe(false);
    });
});
