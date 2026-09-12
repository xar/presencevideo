import { describe, expect, it } from 'vitest';
import { validateProjectData } from '../project-json';

const rawProject = {
    name: 'Imported',
    resolution_width: 1920,
    resolution_height: 1080,
    fps: 30,
    scenes: [
        {
            id: 'scene-1',
            duration_ms: 2000,
            layers: [{ id: 'layer-1', type: 'image', asset_id: 7 }],
        },
    ],
    audio_tracks: [{ id: 'audio-1', name: 'Music', volume: 1 }],
    video_tracks: [
        {
            id: 'video-1',
            name: 'Overlay',
            clips: [{ id: 'clip-1', type: 'video' }],
        },
    ],
    subtitle_tracks: [{ id: 'sub-1', name: 'Captions' }],
};

describe('validateProjectData', () => {
    it('normalises what it accepts, so an import cannot arrive half-shaped', () => {
        const result = validateProjectData(structuredClone(rawProject));
        expect(result.valid).toBe(true);
        if (!result.valid) return;

        const layer = result.data.scenes[0].layers[0] as Record<
            string,
            unknown
        >;

        // Without this the compositor would stretch the image (no `fit`) and
        // the timeline model would have no absolute timing to work from.
        expect(layer.fit).toBe('cover');
        expect(layer.start_ms).toBe(0);
        expect(layer.end_ms).toBe(2000);
        expect(layer.track_id).toBe('scene-1');
        expect(layer.z_index).toBe(0);
    });

    it('fills the gaps in overlay clips and empty track lists too', () => {
        const result = validateProjectData(structuredClone(rawProject));
        expect(result.valid).toBe(true);
        if (!result.valid) return;

        expect(
            (result.data.video_tracks[0].clips[0] as Record<string, unknown>)
                .fit,
        ).toBe('cover');
        expect(result.data.audio_tracks[0].clips).toEqual([]);
        expect(result.data.subtitle_tracks[0].entries).toEqual([]);
    });

    it('still rejects payloads that are not projects', () => {
        expect(
            validateProjectData({ ...rawProject, scenes: 'nope' }).valid,
        ).toBe(false);
        expect(validateProjectData(null).valid).toBe(false);
    });
});
