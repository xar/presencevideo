import { describe, expect, it } from 'vitest';
import type { Asset, Project, SubtitleTrack, VideoLayer } from '@/types';
import {
    makeProject,
    makeScene,
    makeTextLayer,
    makeVideoClip,
    makeVideoTrack,
} from '../../__tests__/fixtures';
import { normalizeProject } from '../../normalize';
import type { ResolvedMediaElement, ResolvedTextElement } from '../frame';
import { resolveFrame } from '../resolve-frame';

function makeAsset(overrides: Partial<Asset> = {}): Asset {
    return {
        id: 1,
        user_id: 1,
        project_id: 1,
        type: 'video',
        source: 'upload',
        name: 'clip.mp4',
        path: 'clip.mp4',
        disk: 'public',
        mime_type: 'video/mp4',
        size_bytes: 10,
        duration_ms: 10_000,
        width: 1920,
        height: 1080,
        thumbnail_path: null,
        metadata: {},
        created_at: '',
        updated_at: '',
        url: 'https://cdn.test/clip.mp4',
        ...overrides,
    };
}

function makeVideoLayer(overrides: Partial<VideoLayer> = {}): VideoLayer {
    return {
        id: 'video-1',
        type: 'video',
        asset_id: 1,
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        z_index: 0,
        ...overrides,
    } as VideoLayer;
}

function project(overrides: Partial<Project> = {}): Project {
    return normalizeProject(makeProject({ video_tracks: [], ...overrides }));
}

describe('resolveFrame', () => {
    it('resolves a legacy scene-only project exactly as it looks today', () => {
        const frame = resolveFrame(
            project({
                scenes: [
                    makeScene({
                        id: 's1',
                        duration_ms: 2000,
                        background_color: '#101010',
                        layers: [
                            makeTextLayer({
                                id: 'behind',
                                text: 'Behind',
                                z_index: 0,
                            }),
                            makeTextLayer({
                                id: 'front',
                                text: 'Front',
                                z_index: 1,
                            }),
                        ],
                    }),
                ],
            }),
            500,
        );

        expect(frame.transition).toBeUndefined();
        expect(frame.primary.backgroundColor).toBe('#101010');
        expect(frame.primary.elements.map((element) => element.id)).toEqual([
            'behind',
            'front',
        ]);

        const text = frame.primary.elements[0] as ResolvedTextElement;
        expect(text).toMatchObject({
            kind: 'text',
            text: 'Behind',
            align: 'center',
            verticalAlign: 'middle',
            opacity: 1,
            localTimeMs: 500,
            origin: 'scene',
            containerId: 's1',
        });
    });

    it('returns an empty frame for no project and for a project with no scenes', () => {
        expect(resolveFrame(null, 0).primary.elements).toEqual([]);

        const frame = resolveFrame(project({ scenes: [] }), 0);
        expect(frame.primary.elements).toEqual([]);
        expect(frame.primary.subtitles).toEqual([]);
    });

    it('includes an element at its start and excludes it at its end', () => {
        const p = project({
            scenes: [
                makeScene({
                    id: 's1',
                    duration_ms: 1000,
                    layers: [makeTextLayer({ id: 'l' })],
                }),
            ],
        });

        expect(resolveFrame(p, 0).primary.elements).toHaveLength(1);
        expect(resolveFrame(p, 999).primary.elements).toHaveLength(1);
        expect(resolveFrame(p, 1000).primary.elements).toHaveLength(0);
    });

    it('shows only the owning scene during a transition, plus the incoming frame', () => {
        const p = project({
            scenes: [
                makeScene({
                    id: 's1',
                    duration_ms: 2000,
                    transition: { type: 'fade', duration_ms: 500 },
                    layers: [makeTextLayer({ id: 'first' })],
                }),
                makeScene({
                    id: 's2',
                    duration_ms: 2000,
                    layers: [makeTextLayer({ id: 'second' })],
                }),
            ],
        });

        const during = resolveFrame(p, 1750);

        expect(during.primary.elements.map((element) => element.id)).toEqual([
            'first',
        ]);
        expect(during.transition?.type).toBe('fade');
        expect(during.transition?.progress).toBeCloseTo(0.5, 5);
        expect(
            during.transition?.incoming.elements.map((element) => element.id),
        ).toEqual(['second']);

        // Past the outgoing scene's end, the incoming scene stands alone.
        const after = resolveFrame(p, 2100);
        expect(after.transition).toBeUndefined();
        expect(after.primary.elements.map((element) => element.id)).toEqual([
            'second',
        ]);
    });

    it('keeps overlay clips above scene layers in one order', () => {
        const frame = resolveFrame(
            project({
                scenes: [
                    makeScene({
                        duration_ms: 2000,
                        layers: [makeTextLayer({ id: 'layer', z_index: 9 })],
                    }),
                ],
                video_tracks: [
                    makeVideoTrack({
                        clips: [
                            makeVideoClip({
                                id: 'clip',
                                z_index: 0,
                                duration_ms: 2000,
                            }),
                        ],
                    }),
                ],
            }),
            100,
        );

        expect(frame.primary.elements.map((element) => element.id)).toEqual([
            'layer',
            'clip',
        ]);
    });

    it('applies keyframes at element-local time', () => {
        const p = project({
            scenes: [
                makeScene({
                    duration_ms: 2000,
                    layers: [
                        makeTextLayer({
                            id: 'fade',
                            x: 0,
                            opacity: 1,
                            keyframes: {
                                opacity: [
                                    { time_ms: 0, value: 0 },
                                    { time_ms: 1000, value: 1 },
                                ],
                                x: [
                                    { time_ms: 0, value: 100 },
                                    { time_ms: 1000, value: 300 },
                                ],
                            },
                        }),
                    ],
                }),
            ],
        });

        expect(resolveFrame(p, 0).primary.elements[0]).toMatchObject({
            opacity: 0,
            x: 100,
        });
        expect(resolveFrame(p, 500).primary.elements[0]).toMatchObject({
            opacity: 0.5,
            x: 200,
        });
        // Past the last keyframe the track holds its final value.
        expect(resolveFrame(p, 1500).primary.elements[0]).toMatchObject({
            opacity: 1,
            x: 300,
        });
    });

    it('does not write animated values back onto the project', () => {
        const layer = makeTextLayer({
            id: 'anim',
            opacity: 1,
            keyframes: {
                opacity: [
                    { time_ms: 0, value: 0 },
                    { time_ms: 1000, value: 1 },
                ],
            },
        });
        const p = project({
            scenes: [makeScene({ duration_ms: 2000, layers: [layer] })],
        });

        resolveFrame(p, 500);

        expect(p.scenes[0].layers[0].opacity).toBe(1);
    });

    it('folds trim and speed into the source timestamp', () => {
        const p = project({
            assets: [makeAsset()],
            scenes: [
                makeScene({
                    duration_ms: 4000,
                    layers: [makeVideoLayer({ trim_start_ms: 2000, speed: 2 })],
                }),
            ],
        });

        const at = (ms: number) =>
            resolveFrame(p, ms).primary.elements[0] as ResolvedMediaElement;

        expect(at(0).sourceTimeSec).toBe(2);
        expect(at(1000).sourceTimeSec).toBe(4);
        expect(at(0).url).toBe('https://cdn.test/clip.mp4');
        expect(at(0).fit).toBe('cover');
    });

    it('holds the last frame once the trimmed source is exhausted', () => {
        const p = project({
            assets: [makeAsset({ duration_ms: 3000 })],
            scenes: [
                makeScene({ duration_ms: 5000, layers: [makeVideoLayer()] }),
            ],
        });

        const at = (ms: number) =>
            resolveFrame(p, ms).primary.elements[0] as ResolvedMediaElement;

        expect(at(2000).sourceTimeSec).toBe(2);
        // Past the source content: null means "hold the last frame", which is
        // what the renderer's `tpad` does — not "paint nothing".
        expect(at(4000).sourceTimeSec).toBeNull();
        expect(at(4000).url).toBe('https://cdn.test/clip.mp4');
    });

    it('never gives a still a source timestamp', () => {
        const p = project({
            assets: [makeAsset({ type: 'image' })],
            scenes: [
                makeScene({
                    duration_ms: 1000,
                    layers: [{ ...makeVideoLayer(), type: 'image' } as never],
                }),
            ],
        });

        expect(
            (resolveFrame(p, 0).primary.elements[0] as ResolvedMediaElement)
                .sourceTimeSec,
        ).toBeNull();
    });

    it('skips an element type this version does not know, without throwing', () => {
        const p = project({
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
                            z_index: 0,
                        } as never,
                        makeTextLayer({ id: 'real', z_index: 1 }),
                    ],
                }),
            ],
        });

        const frame = resolveFrame(p, 0);

        expect(frame.primary.elements.map((element) => element.id)).toEqual([
            'real',
        ]);
    });
});

describe('subtitles', () => {
    const track = (overrides: Partial<SubtitleTrack> = {}): SubtitleTrack => ({
        id: 'st-1',
        name: 'Captions',
        enabled: true,
        style: {
            font_size: 48,
            font_color: '#ffffff',
            background_color: 'transparent',
            position: 'bottom',
            highlight_color: '#ffee00',
        },
        entries: [
            {
                id: 'e1',
                start_ms: 0,
                end_ms: 3000,
                text: 'one two three',
                words: [
                    { text: 'one', start_ms: 0, end_ms: 1000 },
                    { text: 'two', start_ms: 1000, end_ms: 2000 },
                    { text: 'three', start_ms: 2000, end_ms: 3000 },
                ],
            },
        ],
        ...overrides,
    });

    const withSubtitles = (overrides: Partial<SubtitleTrack> = {}) =>
        normalizeProject(
            makeProject({
                scenes: [makeScene({ duration_ms: 4000, layers: [] })],
                video_tracks: [],
                subtitle_tracks: [track(overrides)],
            }),
        );

    it('keeps a word active once reached, but current only while inside it', () => {
        const subtitle = resolveFrame(withSubtitles(), 1500).primary
            .subtitles[0];

        expect(subtitle.words.map((word) => word.active)).toEqual([
            true,
            true,
            false,
        ]);
        expect(subtitle.words.map((word) => word.current)).toEqual([
            false,
            true,
            false,
        ]);
    });

    it('leaves every word active at the end of the entry', () => {
        const subtitle = resolveFrame(withSubtitles(), 2900).primary
            .subtitles[0];

        expect(subtitle.words.every((word) => word.active)).toBe(true);
        expect(subtitle.words.filter((word) => word.current)).toHaveLength(1);
    });

    it('shows nothing outside the entry and nothing for a disabled track', () => {
        expect(resolveFrame(withSubtitles(), 3000).primary.subtitles).toEqual(
            [],
        );
        expect(
            resolveFrame(withSubtitles({ enabled: false }), 500).primary
                .subtitles,
        ).toEqual([]);
    });

    it('uppercases text and words together when the style asks for it', () => {
        const styled = withSubtitles({
            style: { ...track().style, text_transform: 'uppercase' },
        });

        const subtitle = resolveFrame(styled, 500).primary.subtitles[0];

        expect(subtitle.text).toBe('ONE TWO THREE');
        expect(subtitle.words[0].text).toBe('ONE');
        expect(subtitle.uppercase).toBe(true);
    });

    it('treats transparent style colours as "do not paint"', () => {
        const subtitle = resolveFrame(withSubtitles(), 500).primary
            .subtitles[0];

        expect(subtitle.backgroundColor).toBeNull();
        expect(subtitle.highlightColor).toBe('#ffee00');
    });
});
