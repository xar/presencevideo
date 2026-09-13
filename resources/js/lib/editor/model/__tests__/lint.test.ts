import { describe, expect, it } from 'vitest';
import type {
    AudioTrack,
    Layer,
    Project,
    Scene,
    SubtitleTrack,
    TextLayer,
    VideoClip,
} from '@/types/editor';
import {
    makeProject,
    makeScene,
    makeTextLayer,
    makeVideoClip,
    makeVideoTrack,
} from '../../__tests__/fixtures';
import {
    boxIntersectsSafeZone,
    contrastRatio,
    lintProject,
    parseColor,
    scoreIssues,
} from '../lint';
import type { LintRule } from '../lint';
import { LINT_PROFILES } from '../lint-profiles';
import { makeBrandKit } from './brand.test';

const W = 1080;
const H = 1920;

/** A text element comfortably inside the TikTok safe area, readable size. */
function safeText(overrides: Partial<TextLayer> = {}): Layer {
    return makeTextLayer({
        x: 60,
        y: 300,
        width: 800,
        height: 200,
        font_size: 80,
        font_color: '#ffffff',
        ...overrides,
    });
}

/** A clean vertical project: three short scenes, hook text, no audio. */
function vertical(overrides: Partial<Project> = {}, scenes?: Scene[]): Project {
    return makeProject({
        resolution_width: W,
        resolution_height: H,
        scenes: scenes ?? [
            makeScene({
                id: 'a',
                duration_ms: 3000,
                background_color: '#000000',
                layers: [safeText({ id: 'hook', text: 'Hook' })],
            }),
            makeScene({
                id: 'b',
                duration_ms: 3000,
                background_color: '#000000',
                layers: [safeText({ id: 'b1' })],
            }),
            makeScene({
                id: 'c',
                duration_ms: 3000,
                background_color: '#000000',
                layers: [safeText({ id: 'c1' })],
            }),
        ],
        video_tracks: [],
        ...overrides,
    });
}

function rules(
    project: Project,
    profile: 'tiktok' | 'generic' = 'tiktok',
): LintRule[] {
    return lintProject(project, { profile }).issues.map((issue) => issue.rule);
}

describe('lintProject', () => {
    it('gives a clean vertical project a perfect score', () => {
        const report = lintProject(vertical());
        expect(report.issues).toEqual([]);
        expect(report.score).toBe(100);
        expect(report.profile).toBe('tiktok');
    });

    it('does not mutate its input', () => {
        const project = vertical();
        const before = JSON.stringify(project);
        lintProject(project);
        expect(JSON.stringify(project)).toBe(before);
    });

    describe('safe-zone', () => {
        it('flags text under the right rail and the bottom band', () => {
            const project = vertical({}, [
                makeScene({
                    id: 'a',
                    duration_ms: 3000,
                    layers: [
                        safeText({
                            id: 'rail',
                            x: 900,
                            y: 800,
                            width: 150,
                            height: 100,
                        }),
                        safeText({
                            id: 'bottom',
                            x: 60,
                            y: 1700,
                            width: 800,
                            height: 150,
                        }),
                        safeText({ id: 'ok' }),
                    ],
                }),
            ]);
            const issues = lintProject(project).issues.filter(
                (issue) => issue.rule === 'safe-zone',
            );
            expect(issues.map((issue) => issue.elementId).sort()).toEqual([
                'bottom',
                'rail',
            ]);
            expect(issues[0].sceneId).toBe('a');
            expect(issues[0].timeMs).toBe(0);
        });

        it('applies to logos but not to media', () => {
            const project = vertical({ brand_kit: makeBrandKit() }, [
                makeScene({
                    id: 'a',
                    duration_ms: 3000,
                    layers: [
                        safeText({ id: 'hook' }),
                        {
                            id: 'logo',
                            type: 'image',
                            asset_id: 900,
                            x: 940,
                            y: 1000,
                            width: 120,
                            height: 120,
                            z_index: 5,
                            brand_role: 'logo',
                        },
                        {
                            id: 'bg',
                            type: 'image',
                            asset_id: 900,
                            x: 0,
                            y: 0,
                            width: W,
                            height: H,
                            z_index: 0,
                        },
                    ],
                }),
            ]);
            const flagged = lintProject(project)
                .issues.filter((issue) => issue.rule === 'safe-zone')
                .map((issue) => issue.elementId);
            expect(flagged).toEqual(['logo']);
        });

        it('ignores safe zones under the generic profile', () => {
            const project = vertical({}, [
                makeScene({
                    id: 'a',
                    duration_ms: 3000,
                    layers: [safeText({ id: 'bottom', y: 1700 })],
                }),
            ]);
            expect(rules(project, 'generic')).not.toContain('safe-zone');
        });

        it('boxIntersectsSafeZone needs more than 10% overlap', () => {
            const rail = LINT_PROFILES.tiktok.safeZones[0];
            expect(
                boxIntersectsSafeZone(
                    { x: 0, y: 800, width: 900, height: 100 },
                    rail,
                    W,
                    H,
                ),
            ).toBe(false);
            expect(
                boxIntersectsSafeZone(
                    { x: 800, y: 800, width: 200, height: 100 },
                    rail,
                    W,
                    H,
                ),
            ).toBe(true);
        });
    });

    describe('text-too-small', () => {
        it('warns below 3% and errors below 2% of canvas height', () => {
            const project = vertical({}, [
                makeScene({
                    id: 'a',
                    duration_ms: 3000,
                    layers: [
                        safeText({ id: 'small', font_size: 50 }),
                        safeText({ id: 'tiny', font_size: 30 }),
                        safeText({ id: 'fine', font_size: 60 }),
                    ],
                }),
            ]);
            const issues = lintProject(project).issues.filter(
                (issue) => issue.rule === 'text-too-small',
            );
            expect(
                issues.map((issue) => [issue.elementId, issue.severity]),
            ).toEqual([
                ['small', 'warning'],
                ['tiny', 'error'],
            ]);
        });
    });

    describe('out-of-canvas', () => {
        it('flags a box that hangs off the canvas', () => {
            const project = vertical({}, [
                makeScene({
                    id: 'a',
                    duration_ms: 3000,
                    layers: [safeText({ id: 'off', x: 500, width: 800 })],
                }),
            ]);
            expect(rules(project)).toContain('out-of-canvas');
            expect(rules(vertical())).not.toContain('out-of-canvas');
        });

        it('judges keyframed elements at their start', () => {
            const project = vertical({}, [
                makeScene({
                    id: 'a',
                    duration_ms: 3000,
                    layers: [
                        safeText({
                            id: 'slide',
                            x: 60,
                            keyframes: {
                                x: [
                                    { time_ms: 0, value: 60 },
                                    { time_ms: 1000, value: 2000 },
                                ],
                            },
                        }),
                    ],
                }),
            ]);
            expect(rules(project)).not.toContain('out-of-canvas');
        });
    });

    describe('low-contrast', () => {
        it('flags dark text on a dark scene and skips text over media', () => {
            const project = vertical({}, [
                makeScene({
                    id: 'a',
                    duration_ms: 3000,
                    background_color: '#111111',
                    layers: [safeText({ id: 'dark', font_color: '#222222' })],
                }),
                makeScene({
                    id: 'b',
                    duration_ms: 3000,
                    background_color: '#111111',
                    layers: [
                        {
                            id: 'bg',
                            type: 'image',
                            asset_id: 1,
                            x: 0,
                            y: 0,
                            width: W,
                            height: H,
                            z_index: 0,
                        },
                        safeText({
                            id: 'over-media',
                            font_color: '#222222',
                            z_index: 1,
                        }),
                    ],
                }),
            ]);
            const flagged = lintProject(project)
                .issues.filter((issue) => issue.rule === 'low-contrast')
                .map((issue) => issue.elementId);
            expect(flagged).toEqual(['dark']);
        });

        it('uses the element background box and resolves brand tokens first', () => {
            const kit = makeBrandKit({
                colors: {
                    ...makeBrandKit().colors,
                    background: '#ffffff',
                    text: '#ffffff',
                },
            });
            const project = vertical({ brand_kit: kit }, [
                makeScene({
                    id: 'a',
                    duration_ms: 3000,
                    background_color: 'brand.background',
                    layers: [
                        safeText({
                            id: 'white-on-white',
                            font_color: 'brand.text',
                        }),
                    ],
                }),
                makeScene({
                    id: 'b',
                    duration_ms: 3000,
                    background_color: 'brand.background',
                    layers: [
                        safeText({
                            id: 'boxed',
                            font_color: 'brand.text',
                            background_color: '#000000',
                        }),
                    ],
                }),
            ]);
            const flagged = lintProject(project)
                .issues.filter((issue) => issue.rule === 'low-contrast')
                .map((issue) => issue.elementId);
            expect(flagged).toEqual(['white-on-white']);
        });

        it('contrast maths matches WCAG', () => {
            expect(
                contrastRatio(parseColor('#ffffff')!, parseColor('#000000')!),
            ).toBeCloseTo(21, 0);
            expect(parseColor('#fff')).toEqual({
                r: 255,
                g: 255,
                b: 255,
                a: 1,
            });
            expect(parseColor('#00000080')?.a).toBeCloseTo(0.5, 2);
            expect(parseColor('red')).toBeNull();
        });
    });

    describe('hook-missing', () => {
        it('warns when nothing textual or animated starts in the first second', () => {
            const project = vertical({}, [
                makeScene({
                    id: 'a',
                    duration_ms: 3000,
                    layers: [
                        {
                            id: 'bg',
                            type: 'image',
                            asset_id: 1,
                            x: 0,
                            y: 0,
                            width: W,
                            height: H,
                            z_index: 0,
                        },
                    ],
                }),
                makeScene({
                    id: 'b',
                    duration_ms: 3000,
                    layers: [safeText({ id: 'late' })],
                }),
            ]);
            expect(rules(project)).toContain('hook-missing');
        });

        it('accepts an animated opener', () => {
            const project = vertical({}, [
                makeScene({
                    id: 'a',
                    duration_ms: 3000,
                    layers: [
                        {
                            id: 'bg',
                            type: 'image',
                            asset_id: 1,
                            x: 0,
                            y: 0,
                            width: W,
                            height: H,
                            z_index: 0,
                            keyframes: {
                                opacity: [
                                    { time_ms: 0, value: 0 },
                                    { time_ms: 500, value: 1 },
                                ],
                            },
                        },
                    ],
                }),
            ]);
            expect(rules(project)).not.toContain('hook-missing');
        });
    });

    describe('pacing and duration', () => {
        it('flags a long scene and slow average pacing', () => {
            const project = vertical({}, [
                makeScene({
                    id: 'a',
                    duration_ms: 9000,
                    layers: [safeText({ id: 'hook' })],
                }),
            ]);
            const found = rules(project);
            expect(found).toContain('scene-too-long');
            expect(found).toContain('pacing-slow');
            expect(rules(vertical())).not.toContain('pacing-slow');
        });

        it('caps duration and flags very short videos', () => {
            const long = vertical(
                {},
                Array.from({ length: 20 }, (_, index) =>
                    makeScene({
                        id: `s${index}`,
                        duration_ms: 3500,
                        layers: [safeText({ id: `t${index}` })],
                    }),
                ),
            );
            const longer = vertical(
                {},
                Array.from({ length: 60 }, (_, index) =>
                    makeScene({
                        id: `s${index}`,
                        duration_ms: 3500,
                        layers: [safeText({ id: `t${index}` })],
                    }),
                ),
            );
            const short = vertical({}, [
                makeScene({
                    id: 'a',
                    duration_ms: 2000,
                    layers: [safeText({ id: 'hook' })],
                }),
            ]);

            expect(
                lintProject(long).issues.find(
                    (issue) => issue.rule === 'duration-over',
                )?.severity,
            ).toBe('warning');
            expect(
                lintProject(longer).issues.find(
                    (issue) => issue.rule === 'duration-over',
                )?.severity,
            ).toBe('error');
            expect(rules(short)).toContain('duration-short');
            expect(rules(short, 'generic')).not.toContain('duration-short');
        });
    });

    describe('audio', () => {
        const voice: AudioTrack = {
            id: 'voice',
            name: 'Voice',
            volume: 1,
            clips: [
                {
                    id: 'v1',
                    asset_id: 5,
                    start_ms: 0,
                    duration_ms: 2000,
                    volume: 1,
                },
                {
                    id: 'v2',
                    asset_id: 5,
                    start_ms: 6000,
                    duration_ms: 2000,
                    volume: 1,
                },
            ],
        };
        const captions: SubtitleTrack = {
            id: 'cap',
            name: 'Captions',
            enabled: true,
            style: {
                font_size: 60,
                font_color: '#fff',
                background_color: 'transparent',
                position: 'bottom',
            },
            entries: [{ id: 'e', start_ms: 0, end_ms: 2000, text: 'hi' }],
        };

        it('wants captions when there is audio, and reports gaps', () => {
            const without = vertical({ audio_tracks: [voice] });
            const found = lintProject(without).issues;
            expect(found.map((issue) => issue.rule)).toContain(
                'captions-missing',
            );
            const gap = found.find((issue) => issue.rule === 'audio-gap');
            expect(gap?.severity).toBe('info');
            expect(gap?.timeMs).toBe(2000);

            const withCaptions = vertical({
                audio_tracks: [voice],
                subtitle_tracks: [captions],
            });
            expect(rules(withCaptions)).not.toContain('captions-missing');
            expect(rules(vertical())).not.toContain('captions-missing');
        });
    });

    describe('scenes and assets', () => {
        it('flags an empty scene unless an overlay covers it', () => {
            const empty = vertical({}, [
                makeScene({
                    id: 'a',
                    duration_ms: 3000,
                    layers: [safeText({ id: 'hook' })],
                }),
                makeScene({ id: 'empty', duration_ms: 3000, layers: [] }),
            ]);
            expect(
                lintProject(empty).issues.find(
                    (issue) => issue.rule === 'empty-scene',
                )?.sceneId,
            ).toBe('empty');

            const covered = vertical(
                {
                    video_tracks: [
                        makeVideoTrack({
                            clips: [
                                makeVideoClip({
                                    id: 'o',
                                    start_ms: 0,
                                    duration_ms: 6000,
                                    x: 60,
                                    y: 300,
                                    width: 800,
                                    height: 200,
                                    font_size: 80,
                                } as Partial<VideoClip>),
                            ],
                        }),
                    ],
                },
                [
                    makeScene({
                        id: 'a',
                        duration_ms: 3000,
                        layers: [safeText({ id: 'hook' })],
                    }),
                    makeScene({ id: 'empty', duration_ms: 3000, layers: [] }),
                ],
            );
            expect(rules(covered)).not.toContain('empty-scene');
        });

        it('errors on an asset the project does not have, only when assets are known', () => {
            const scenes = [
                makeScene({
                    id: 'a',
                    duration_ms: 3000,
                    layers: [
                        safeText({ id: 'hook' }),
                        {
                            id: 'img',
                            type: 'image',
                            asset_id: 42,
                            x: 0,
                            y: 0,
                            width: W,
                            height: H,
                            z_index: 0,
                        },
                    ],
                }),
            ];
            const known = vertical({ assets: [] }, scenes);
            expect(
                lintProject(known).issues.find(
                    (issue) => issue.rule === 'missing-asset',
                )?.severity,
            ).toBe('error');

            const unknown = vertical({ assets: undefined }, scenes);
            expect(rules(unknown)).not.toContain('missing-asset');
        });
    });

    describe('brand rules', () => {
        const kit = makeBrandKit({
            outro_asset_id: 77,
            watermark: {
                asset_id: 78,
                position: 'top-right',
                opacity: 0.6,
                size: 0.1,
            },
        });

        it('stays silent without a kit', () => {
            const project = vertical({}, [
                makeScene({
                    id: 'a',
                    duration_ms: 3000,
                    layers: [
                        safeText({
                            id: 'hook',
                            font_color: '#123456',
                            font_family: 'Comic Sans',
                        }),
                    ],
                }),
            ]);
            expect(
                rules(project).some((rule) => rule.startsWith('brand-')),
            ).toBe(false);
        });

        it('flags off-palette colours and foreign fonts, once per element', () => {
            const project = vertical({ brand_kit: kit }, [
                makeScene({
                    id: 'a',
                    duration_ms: 3000,
                    layers: [
                        safeText({
                            id: 'off',
                            font_color: '#123456',
                            background_color: '#654321',
                            font_family: 'Comic Sans',
                        }),
                        safeText({
                            id: 'on',
                            font_color: 'brand.primary',
                            font_family: 'brand.display',
                        }),
                        safeText({
                            id: 'literal-on',
                            font_color: '#FF0055',
                            font_family: 'Inter, sans-serif',
                        }),
                        {
                            id: 'shape',
                            type: 'shape',
                            shape: 'rectangle',
                            x: 0,
                            y: 300,
                            width: 100,
                            height: 100,
                            z_index: 1,
                            fill_color: '#abcdef',
                        },
                    ],
                }),
            ]);
            const issues = lintProject(project).issues;
            expect(
                issues
                    .filter((issue) => issue.rule === 'brand-off-palette')
                    .map((issue) => issue.elementId),
            ).toEqual(['off', 'shape']);
            expect(
                issues
                    .filter((issue) => issue.rule === 'brand-font')
                    .map((issue) => issue.elementId),
            ).toEqual(['off']);
        });

        it('reports missing logo, outro and watermark as info, and a small logo as a warning', () => {
            const missing = vertical({ brand_kit: kit });
            const found = rules(missing);
            expect(found).toContain('brand-logo-missing');
            expect(found).toContain('brand-outro-missing');
            expect(found).toContain('brand-watermark-missing');

            const present = vertical({ brand_kit: kit }, [
                makeScene({
                    id: 'a',
                    duration_ms: 3000,
                    layers: [
                        safeText({ id: 'hook' }),
                        {
                            id: 'logo',
                            type: 'image',
                            asset_id: 900,
                            x: 60,
                            y: 1300,
                            width: 40,
                            height: 40,
                            z_index: 5,
                            brand_role: 'logo',
                        },
                        {
                            id: 'wm',
                            type: 'image',
                            asset_id: 78,
                            x: 60,
                            y: 300,
                            width: 100,
                            height: 100,
                            z_index: 5,
                            brand_role: 'watermark',
                        },
                        {
                            id: 'outro',
                            type: 'video',
                            asset_id: 77,
                            x: 0,
                            y: 0,
                            width: W,
                            height: H,
                            z_index: 0,
                        },
                    ],
                }),
            ]);
            const presentRules = rules(present);
            expect(presentRules).not.toContain('brand-logo-missing');
            expect(presentRules).not.toContain('brand-outro-missing');
            expect(presentRules).not.toContain('brand-watermark-missing');
            expect(presentRules).toContain('brand-logo-small');
        });
    });

    it('scores 100 minus 20 per error, 7 per warning and 2 per info, clamped', () => {
        const issue = (severity: 'error' | 'warning' | 'info') => ({
            id: severity,
            rule: 'safe-zone' as const,
            severity,
            message: '',
        });
        expect(
            scoreIssues([issue('error'), issue('warning'), issue('info')]),
        ).toBe(71);
        expect(
            scoreIssues(Array.from({ length: 10 }, () => issue('error'))),
        ).toBe(0);
        expect(scoreIssues([])).toBe(100);
    });

    it('gives issues stable ids', () => {
        const project = vertical({}, [
            makeScene({
                id: 'a',
                duration_ms: 3000,
                layers: [safeText({ id: 'bottom', y: 1700 })],
            }),
        ]);
        const first = lintProject(project).issues.map((issue) => issue.id);
        const second = lintProject(project).issues.map((issue) => issue.id);
        expect(first).toEqual(second);
        expect(first).toContain('safe-zone:bottom');
    });
});
