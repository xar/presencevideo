import { describe, expect, it } from 'vitest';
import type { Project, TextLayer } from '@/types/editor';
import { normalizeProject } from '../../normalize';
import { lintProject } from '../lint';
import {
    RECIPES,
    RECIPE_IDS,
    applyRecipe,
    listRecipes,
    validateBrandKitForRecipe
    
} from '../recipes';
import type {RecipeInput} from '../recipes';
import { resolveFrame } from '../resolve-frame';
import { buildTimeline } from '../timeline';
import { makeBrandKit } from './brand.test';

function beats(): RecipeInput['beats'] {
    return [
        {
            id: 'hook',
            kind: 'hook',
            headline: 'Stop scrolling',
            sub: 'This changes everything',
            voiceover: 'Stop scrolling, this changes everything',
            duration_ms: 2500,
            asset_id: 11,
            asset_type: 'image',
            voice_asset_id: 31,
            words: [
                { text: 'Stop', start_ms: 0, end_ms: 400 },
                { text: 'scrolling', start_ms: 400, end_ms: 1000 },
            ],
        },
        {
            id: 'b1',
            kind: 'body',
            headline: 'Point one',
            sub: 'Why it matters',
            voiceover: 'Point one',
            duration_ms: 3500,
            asset_id: 12,
            asset_type: 'video',
            voice_asset_id: 32,
        },
        {
            id: 'b2',
            kind: 'body',
            headline: 'Point two',
            duration_ms: 3500,
            asset_id: 13,
            asset_type: 'image',
            voice_asset_id: 33,
        },
        {
            id: 'cta',
            kind: 'cta',
            headline: 'Follow for more',
            sub: '@acme',
            voiceover: 'Follow for more',
            duration_ms: 3000,
            asset_id: 14,
            asset_type: 'image',
            voice_asset_id: 34,
        },
    ];
}

function input(overrides: Partial<RecipeInput> = {}): RecipeInput {
    return {
        beats: beats(),
        canvas: { width: 1080, height: 1920 },
        fps: 30,
        brand: null,
        music_asset_id: 21,
        ...overrides,
    };
}

function asProject(
    output: ReturnType<typeof applyRecipe>,
    brand: RecipeInput['brand'] = null,
): Project {
    return normalizeProject({
        id: 1,
        user_id: 1,
        name: 'Recipe',
        status: 'draft',
        created_at: '',
        updated_at: '',
        brand_kit: brand ?? null,
        assets: [11, 12, 13, 14, 21, 31, 32, 33, 34, 77, 900].map((id) => ({
            id,
            user_id: 1,
            project_id: 1,
            type:
                id === 12 || id === 77
                    ? 'video'
                    : id > 20 && id < 40
                      ? 'audio'
                      : 'image',
            source: 'upload',
            name: `a${id}`,
            path: '',
            disk: 'local',
            mime_type: '',
            size_bytes: 0,
            duration_ms: 4000,
            width: 1080,
            height: 1920,
            thumbnail_path: null,
            metadata: {},
            created_at: '',
            updated_at: '',
        })),
        ...output,
    } as Project);
}

describe('recipes', () => {
    const kit = makeBrandKit({
        outro_asset_id: 77,
        music: { mood: 'upbeat', asset_ids: [21] },
    });

    it('lists every recipe with its slots', () => {
        const listed = listRecipes();
        expect(listed.map((recipe) => recipe.id)).toEqual(RECIPE_IDS);
        expect(listed[0].slots.logo).toBe(true);
    });

    it.each(RECIPE_IDS)(
        '%s builds a lint-clean, brand-token composition',
        (id) => {
            const output = applyRecipe(id, input({ brand: kit }));
            const project = asProject(output, kit);
            const timeline = buildTimeline(project);
            const report = lintProject(project, { profile: 'tiktok' });

            expect(timeline.durationMs).toBeGreaterThan(0);
            expect(
                report.summary.errors,
                JSON.stringify(report.issues, null, 1),
            ).toBe(0);
            expect(
                report.issues.filter((issue) => issue.rule === 'safe-zone'),
                JSON.stringify(report.issues, null, 1),
            ).toEqual([]);
            expect(
                report.issues.filter((issue) =>
                    issue.rule.startsWith('brand-'),
                ),
                JSON.stringify(report.issues, null, 1),
            ).toEqual([]);

            // Structure: one scene per beat plus the outro, logo overlay, captions, voice + music.
            expect(output.scenes.map((scene) => scene.id)).toEqual([
                'hook',
                'b1',
                'b2',
                'cta',
                'brand:outro',
            ]);
            expect(
                output.video_tracks[0].clips.find(
                    (clip) => clip.brand_role === 'logo',
                ),
            ).toBeTruthy();
            expect(output.subtitle_tracks).toHaveLength(1);
            expect(
                output.subtitle_tracks[0].entries.map((entry) => entry.id),
            ).toEqual(['hook:caption', 'b1:caption', 'cta:caption']);
            expect(output.subtitle_tracks[0].entries[0].words?.[1]).toEqual({
                text: 'scrolling',
                start_ms: 400,
                end_ms: 1000,
            });
            expect(output.subtitle_tracks[0].style.highlight_color).toBe(
                'brand.caption_highlight',
            );
            expect(output.audio_tracks.map((track) => track.id)).toEqual([
                'recipe:voice',
                'recipe:music',
            ]);
            expect(output.audio_tracks[0].clips[1].start_ms).toBe(2500);

            const headline = output.scenes[0].layers.find(
                (layer) => layer.id === 'hook:headline',
            ) as TextLayer;
            expect(headline.font_color).toMatch(/^brand\./);
            expect(headline.font_family).toBe('brand.display');
            expect(output.scenes[0].background_color).toBe('brand.background');

            // Every scene paints something.
            for (const scene of buildTimeline(project).scenes) {
                expect(
                    resolveFrame(project, scene.startMs + 100).primary.elements
                        .length,
                    scene.id,
                ).toBeGreaterThan(0);
            }
        },
    );

    it.each(RECIPE_IDS)(
        '%s uses literals, no logo and no outro without a brand kit',
        (id) => {
            const output = applyRecipe(id, input());
            const project = asProject(output);
            const report = lintProject(project);

            expect(report.summary.errors).toBe(0);
            expect(
                report.issues.filter((issue) => issue.rule === 'safe-zone'),
            ).toEqual([]);
            expect(output.scenes.map((scene) => scene.id)).toEqual([
                'hook',
                'b1',
                'b2',
                'cta',
            ]);
            expect(output.video_tracks).toEqual([]);
            expect(JSON.stringify(output)).not.toContain('brand.');
            expect(output.subtitle_tracks[0].style.preset).toBe('bold-outline');
        },
    );

    it('is deterministic', () => {
        expect(applyRecipe('tiktok-listicle', input({ brand: kit }))).toEqual(
            applyRecipe('tiktok-listicle', input({ brand: kit })),
        );
    });

    it('scales layout with the canvas', () => {
        const small = applyRecipe(
            'tiktok-hook-body-cta',
            input({ canvas: { width: 540, height: 960 } }),
        );
        const headline = small.scenes[0].layers.find(
            (layer) => layer.id === 'hook:headline',
        ) as TextLayer;
        expect(headline.font_size).toBe(48);
        expect(headline.x + headline.width).toBeLessThanOrEqual(540 * 0.86);
    });

    it('rejects unknown recipes and empty beats', () => {
        expect(() => applyRecipe('nope' as never, input())).toThrow(
            /Unknown recipe/,
        );
        expect(() =>
            applyRecipe('tiktok-listicle', input({ beats: [] })),
        ).toThrow(/at least one beat/);
    });

    it('validateBrandKitForRecipe lists what the kit lacks', () => {
        const recipe = RECIPES['tiktok-hook-body-cta'];
        expect(validateBrandKitForRecipe(kit, recipe)).toEqual({
            ok: true,
            missing: [],
        });

        const bare = makeBrandKit({
            colors: { primary: '#fff' },
            fonts: {},
            logos: {},
            voice: null,
            music: null,
        });
        const result = validateBrandKitForRecipe(bare, recipe);
        expect(result.ok).toBe(false);
        expect(result.missing).toEqual([
            'colors.accent',
            'colors.background',
            'colors.text',
            'colors.caption_highlight',
            'fonts.display',
            'fonts.body',
            'fonts.caption',
            'logos.mark',
            'outro_asset_id',
            'voice.model_id',
            'music',
        ]);

        expect(
            validateBrandKitForRecipe(null, recipe).missing.length,
        ).toBeGreaterThan(5);
    });
});
