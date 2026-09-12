import { describe, expect, it } from 'vitest';
import type { Project, Scene } from '@/types';
import {
    makeProject,
    makeScene,
    makeTextLayer,
    makeVideoClip,
    makeVideoTrack,
} from '../../__tests__/fixtures';
import { normalizeProject } from '../../normalize';
import {
    buildTimeline,
    elementsAt,
    mapTimelineMs,
    resolveTransitions,
    sceneIndexAt,
    sceneStartsMs,
    totalDurationMs,
    transitionAt,
} from '../timeline';

function legacyProject(overrides: Partial<Project> = {}): Project {
    return normalizeProject(
        makeProject({
            scenes: [
                makeScene({
                    id: 'scene-a',
                    duration_ms: 3000,
                    layers: [
                        makeTextLayer({ id: 'a1', z_index: 0 }),
                        makeTextLayer({ id: 'a2', z_index: 1 }),
                    ],
                }),
                makeScene({
                    id: 'scene-b',
                    duration_ms: 2000,
                    layers: [makeTextLayer({ id: 'b1', z_index: 0 })],
                }),
            ],
            video_tracks: [],
            ...overrides,
        }),
    );
}

describe('buildTimeline', () => {
    it('lifts scene layers onto the timeline by prefix sum', () => {
        const timeline = buildTimeline(legacyProject());

        expect(
            timeline.elements.map((element) => [
                element.id,
                element.start_ms,
                element.end_ms,
            ]),
        ).toEqual([
            ['a1', 0, 3000],
            ['a2', 0, 3000],
            ['b1', 3000, 5000],
        ]);
        expect(timeline.scenes.map((scene) => scene.startMs)).toEqual([
            0, 3000,
        ]);
        expect(timeline.durationMs).toBe(5000);
    });

    it('records the owning container on every element', () => {
        const timeline = buildTimeline(
            legacyProject({
                video_tracks: [
                    makeVideoTrack({
                        id: 'vt-1',
                        clips: [makeVideoClip({ id: 'c1' })],
                    }),
                ],
            }),
        );

        const scene = timeline.elements.find((element) => element.id === 'a1');
        const clip = timeline.elements.find((element) => element.id === 'c1');

        expect(scene).toMatchObject({
            origin: 'scene',
            container_id: 'scene-a',
            track_id: 'scene-a',
        });
        expect(clip).toMatchObject({
            origin: 'track',
            container_id: 'vt-1',
            track_id: 'vt-1',
        });
    });

    it('orders scene layers below overlay clips in one global z sequence', () => {
        const project = legacyProject({
            video_tracks: [
                makeVideoTrack({
                    id: 'vt-1',
                    clips: [
                        makeVideoClip({ id: 'top', z_index: 5 }),
                        makeVideoClip({ id: 'bottom', z_index: 1 }),
                    ],
                }),
            ],
        });

        const timeline = buildTimeline(project);
        const order = timeline.elements
            .slice()
            .sort((a, b) => a.z_index - b.z_index)
            .map((element) => element.id);

        // Legacy stacking: scene layers by their scene-scoped z, then every clip
        // above them (the old preview forced clips up with `z-[100]`).
        expect(order).toEqual(['a1', 'a2', 'b1', 'bottom', 'top']);
        expect(
            new Set(timeline.elements.map((element) => element.z_index)).size,
        ).toBe(5);
    });

    it('respects a scene layer z_index that is sparse or out of order', () => {
        const project = normalizeProject(
            makeProject({
                scenes: [
                    makeScene({
                        id: 's',
                        duration_ms: 1000,
                        layers: [
                            makeTextLayer({ id: 'high', z_index: 90 }),
                            makeTextLayer({ id: 'low', z_index: 20 }),
                            makeTextLayer({ id: 'mid', z_index: 30 }),
                        ],
                    }),
                ],
                video_tracks: [],
            }),
        );

        expect(
            buildTimeline(project).elements.map((element) => element.id),
        ).toEqual(['low', 'mid', 'high']);
    });

    it('drops clips on a hidden track', () => {
        const project = legacyProject({
            video_tracks: [
                makeVideoTrack({
                    id: 'vt-1',
                    visible: false,
                    clips: [makeVideoClip({ id: 'c1' })],
                }),
            ],
        });

        expect(
            buildTimeline(project).elements.map((element) => element.id),
        ).not.toContain('c1');
    });

    it('returns an empty timeline for no project and for an empty project', () => {
        expect(buildTimeline(null)).toEqual({
            elements: [],
            tracks: [],
            scenes: [],
            durationMs: 0,
        });

        const empty = buildTimeline(
            normalizeProject(makeProject({ scenes: [], video_tracks: [] })),
        );
        expect(empty.elements).toEqual([]);
        expect(empty.scenes).toEqual([]);
        expect(empty.durationMs).toBe(0);
    });
});

describe('transitions', () => {
    const withTransition = (durationMs = 500): Scene[] => [
        makeScene({
            id: 's1',
            duration_ms: 3000,
            transition: { type: 'fade', duration_ms: durationMs },
        }),
        makeScene({ id: 's2', duration_ms: 3000 }),
        makeScene({ id: 's3', duration_ms: 3000 }),
    ];

    it('resolves nothing when no scene declares a transition', () => {
        expect(resolveTransitions([makeScene(), makeScene()])).toEqual([]);
    });

    it('gives every junction a transition once any scene declares one', () => {
        const resolved = resolveTransitions(withTransition(), 30);

        expect(resolved).toHaveLength(2);
        expect(resolved[0]).toMatchObject({
            type: 'fade',
            durationMs: 500,
            declared: true,
        });
        // Undeclared junctions get a one-frame fade so the xfade chain is uniform.
        expect(resolved[1]).toMatchObject({
            type: 'fade',
            durationMs: 33,
            declared: false,
        });
    });

    it('clamps a transition to 1500ms and to half of either neighbouring scene', () => {
        const short = [
            makeScene({
                duration_ms: 800,
                transition: { type: 'fade', duration_ms: 5000 },
            }),
            makeScene({ duration_ms: 9000 }),
        ];

        expect(resolveTransitions(short)[0].durationMs).toBe(400);

        const long = [
            makeScene({
                duration_ms: 9000,
                transition: { type: 'fade', duration_ms: 5000 },
            }),
            makeScene({ duration_ms: 9000 }),
        ];

        expect(resolveTransitions(long)[0].durationMs).toBe(1500);
    });

    it('shortens the total duration by the transition overlap', () => {
        const project = normalizeProject(
            makeProject({ scenes: withTransition(), video_tracks: [] }),
        );

        // 9000 raw, minus a declared 500ms and one forced one-frame fade.
        expect(totalDurationMs(project)).toBe(9000 - 500 - 33);
        expect(buildTimeline(project).durationMs).toBe(9000 - 533);
    });

    it('overlaps scene starts by the transition duration', () => {
        expect(sceneStartsMs(withTransition(), 30)).toEqual([0, 2500, 5467]);
    });

    it('shifts absolute times onto the transition-aware timeline', () => {
        const scenes = withTransition();

        expect(mapTimelineMs(scenes, 0, 30)).toBe(0);
        expect(mapTimelineMs(scenes, 2000, 30)).toBe(2000);
        expect(mapTimelineMs(scenes, 4000, 30)).toBe(3500);
        expect(mapTimelineMs(scenes, 7000, 30)).toBe(6467);
    });

    it('reports the junction the playhead is inside', () => {
        const timeline = buildTimeline(
            normalizeProject(
                makeProject({ scenes: withTransition(), video_tracks: [] }),
            ),
        );

        expect(transitionAt(timeline, 2000)).toBeNull();
        expect(transitionAt(timeline, 2500)).toMatchObject({
            index: 0,
            type: 'fade',
            progress: 0,
        });
        expect(transitionAt(timeline, 2750)?.progress).toBeCloseTo(0.5, 5);
        expect(transitionAt(timeline, 3000)).toBeNull();
    });

    it('shifts overlay clips by the same mapping as the renderer', () => {
        const project = normalizeProject(
            makeProject({
                scenes: withTransition(),
                video_tracks: [
                    makeVideoTrack({
                        clips: [
                            makeVideoClip({
                                id: 'c',
                                start_ms: 4000,
                                duration_ms: 1000,
                            }),
                        ],
                    }),
                ],
            }),
        );

        const clip = buildTimeline(project).elements.find(
            (element) => element.id === 'c',
        );

        expect(clip).toMatchObject({ start_ms: 3500, end_ms: 4500 });
    });
});

describe('queries', () => {
    it('treats an element as live from its start up to but not including its end', () => {
        const timeline = buildTimeline(legacyProject());

        expect(elementsAt(timeline, 0).map((element) => element.id)).toEqual([
            'a1',
            'a2',
        ]);
        expect(elementsAt(timeline, 2999).map((element) => element.id)).toEqual(
            ['a1', 'a2'],
        );
        expect(elementsAt(timeline, 3000).map((element) => element.id)).toEqual(
            ['b1'],
        );
        expect(elementsAt(timeline, 5000)).toEqual([]);
    });

    it('locates the scene at a time, clamping past the end', () => {
        const timeline = buildTimeline(legacyProject());

        expect(sceneIndexAt(timeline, 0)).toBe(0);
        expect(sceneIndexAt(timeline, 3000)).toBe(1);
        expect(sceneIndexAt(timeline, 99_000)).toBe(1);
        expect(sceneIndexAt(buildTimeline(null), 0)).toBe(-1);
    });
});
