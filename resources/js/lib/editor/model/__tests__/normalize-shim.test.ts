import { describe, expect, it } from 'vitest';
import type { Project, TimelineElement } from '@/types';
import {
    makeProject,
    makeScene,
    makeTextLayer,
} from '../../__tests__/fixtures';
import { normalizeProject } from '../../normalize';

/**
 * The compatibility shim: stored projects predate the unified timeline, and
 * they must keep opening with no data migration and no loss of anything the
 * editor does not understand.
 */
describe('normalizeProject as the unified-model shim', () => {
    function legacy(): Project {
        return makeProject({
            video_tracks: [],
            scenes: [
                makeScene({
                    id: 's1',
                    duration_ms: 3000,
                    layers: [makeTextLayer({ id: 'a' })],
                }),
                makeScene({
                    id: 's2',
                    duration_ms: 2000,
                    layers: [makeTextLayer({ id: 'b' })],
                }),
                makeScene({
                    id: 's3',
                    duration_ms: 1000,
                    layers: [makeTextLayer({ id: 'c' })],
                }),
            ],
        });
    }

    const timed = (project: Project, sceneIndex: number, layerIndex = 0) =>
        project.scenes[sceneIndex].layers[
            layerIndex
        ] as unknown as TimelineElement;

    it('derives absolute timing for scene layers from the enclosing scene', () => {
        const project = normalizeProject(legacy());

        expect(timed(project, 0)).toMatchObject({
            start_ms: 0,
            end_ms: 3000,
            track_id: 's1',
        });
        expect(timed(project, 1)).toMatchObject({
            start_ms: 3000,
            end_ms: 5000,
            track_id: 's2',
        });
        expect(timed(project, 2)).toMatchObject({
            start_ms: 5000,
            end_ms: 6000,
            track_id: 's3',
        });
    });

    it('never overwrites timing a payload already carries', () => {
        const project = makeProject({
            video_tracks: [],
            scenes: [
                makeScene({
                    id: 's1',
                    duration_ms: 3000,
                    layers: [
                        {
                            ...makeTextLayer({ id: 'a' }),
                            start_ms: 250,
                            end_ms: 750,
                            track_id: 'other',
                        } as never,
                    ],
                }),
            ],
        });

        expect(normalizeProject(project).scenes[0].layers[0]).toMatchObject({
            start_ms: 250,
            end_ms: 750,
            track_id: 'other',
        });
    });

    it('defaults media fit to cover and leaves an explicit fit alone', () => {
        const project = normalizeProject(
            makeProject({
                video_tracks: [],
                scenes: [
                    makeScene({
                        duration_ms: 1000,
                        layers: [
                            {
                                id: 'v',
                                type: 'video',
                                asset_id: 1,
                                x: 0,
                                y: 0,
                                width: 1,
                                height: 1,
                                z_index: 0,
                            } as never,
                            {
                                id: 'i',
                                type: 'image',
                                asset_id: 2,
                                x: 0,
                                y: 0,
                                width: 1,
                                height: 1,
                                z_index: 0,
                                fit: 'contain',
                            } as never,
                            makeTextLayer({ id: 't' }),
                        ],
                    }),
                ],
            }),
        );

        const [video, image, text] = project.scenes[0].layers as Array<
            Record<string, unknown>
        >;
        expect(video.fit).toBe('cover');
        expect(image.fit).toBe('contain');
        expect(text.fit).toBeUndefined();
    });

    it('preserves unknown element types and unknown keys byte for byte', () => {
        const project = normalizeProject(
            makeProject({
                video_tracks: [],
                scenes: [
                    makeScene({
                        duration_ms: 1000,
                        layers: [
                            {
                                id: 'fx',
                                type: 'effect',
                                x: 0,
                                y: 0,
                                width: 10,
                                height: 10,
                                z_index: 91,
                                intensity: 0.4,
                            } as never,
                            {
                                id: 'drifted',
                                type: 'shape',
                                shape: 'rect',
                                fill_color: '#fff',
                                align: 'left',
                                font_weight: '600',
                                x: 0,
                                y: 0,
                                width: 1,
                                height: 1,
                                z_index: 20,
                            } as never,
                        ],
                    }),
                ],
            }),
        );

        const [effect, drifted] = project.scenes[0].layers as Array<
            Record<string, unknown>
        >;

        expect(effect).toMatchObject({
            type: 'effect',
            intensity: 0.4,
            z_index: 91,
        });
        // Non-canonical enum values are NOT rewritten here; see the note in
        // normalizeElement. Silently editing stored user data is a separate call.
        expect(drifted).toMatchObject({
            shape: 'rect',
            align: 'left',
            font_weight: '600',
        });
    });

    it('is idempotent and preserves object identity', () => {
        const project = legacy();
        const scene = project.scenes[0];
        const layer = project.scenes[0].layers[0];

        const once = normalizeProject(project);
        const twice = normalizeProject(once);

        expect(once).toBe(project);
        expect(twice).toBe(project);
        expect(twice.scenes[0]).toBe(scene);
        expect(twice.scenes[0].layers[0]).toBe(layer);
        expect(timed(twice, 1)).toMatchObject({ start_ms: 3000, end_ms: 5000 });
    });
});
