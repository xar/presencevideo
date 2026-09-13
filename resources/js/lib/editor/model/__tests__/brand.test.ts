import { describe, expect, it } from 'vitest';
import type { BrandKit } from '@/types/editor';
import {
    makeProject,
    makeScene,
    makeTextLayer,
} from '../../__tests__/fixtures';
import { normalizeProject } from '../../normalize';
import {
    FALLBACK_BRAND_COLOR,
    FALLBACK_BRAND_FONT,
    brandToken,
    isBrandToken,
    resolveBrandColor,
    resolveBrandFont,
    resolveProjectBrand,
} from '../brand';
import { resolveFrame } from '../resolve-frame';

export function makeBrandKit(overrides: Partial<BrandKit> = {}): BrandKit {
    return {
        id: 7,
        user_id: 1,
        name: 'Acme',
        website_url: null,
        colors: {
            primary: '#ff0055',
            secondary: '#cccccc',
            accent: '#ffcc00',
            background: '#101010',
            text: '#ffffff',
            caption_highlight: '#ffcc00',
        },
        fonts: {
            display: 'Montserrat, sans-serif',
            body: 'Inter, sans-serif',
            caption: 'Inter, sans-serif',
        },
        logos: { mark: 900 },
        watermark: null,
        intro_asset_id: null,
        outro_asset_id: null,
        voice: {
            model_id: 'fal-ai/minimax/speech-2.8-turbo',
            voice_id: 'Wise_Woman',
        },
        music: { mood: 'upbeat', asset_ids: [] },
        caption_preset: 'karaoke',
        motion_preset: null,
        tone: 'Playful, direct.',
        created_at: '',
        updated_at: '',
        ...overrides,
    };
}

describe('brand tokens', () => {
    const kit = makeBrandKit();

    it('recognises tokens and nothing else', () => {
        expect(isBrandToken('brand.primary')).toBe(true);
        expect(isBrandToken('#ffffff')).toBe(false);
        expect(isBrandToken(null)).toBe(false);
        expect(brandToken('accent')).toBe('brand.accent');
    });

    it('resolves colour tokens against the kit and passes literals through', () => {
        expect(resolveBrandColor('brand.primary', kit)).toBe('#ff0055');
        expect(resolveBrandColor('#123456', kit)).toBe('#123456');
        expect(resolveBrandColor('transparent', kit)).toBe('transparent');
        expect(resolveBrandColor(undefined, kit)).toBeUndefined();
        expect(resolveBrandColor(null, kit)).toBeNull();
    });

    it('falls back when the kit is missing or the role is unset', () => {
        expect(resolveBrandColor('brand.primary', null)).toBe(
            FALLBACK_BRAND_COLOR,
        );
        expect(resolveBrandColor('brand.nonsense', kit)).toBe(
            FALLBACK_BRAND_COLOR,
        );
        expect(resolveBrandFont('brand.display', null)).toBe(
            FALLBACK_BRAND_FONT,
        );
        expect(resolveBrandFont('brand.display', kit)).toBe(
            'Montserrat, sans-serif',
        );
        expect(resolveBrandFont('Arial', kit)).toBe('Arial');
    });

    it('resolveProjectBrand returns a resolved deep copy and leaves the input alone', () => {
        const project = makeProject({
            brand_kit: kit,
            scenes: [
                makeScene({
                    background_color: 'brand.background',
                    layers: [
                        makeTextLayer({
                            id: 't',
                            font_color: 'brand.primary',
                            font_family: 'brand.display',
                        }),
                    ],
                }),
            ],
            subtitle_tracks: [
                {
                    id: 's',
                    name: 'Captions',
                    enabled: true,
                    style: {
                        font_size: 60,
                        font_color: 'brand.text',
                        background_color: 'transparent',
                        position: 'bottom',
                        highlight_color: 'brand.caption_highlight',
                        font_family: 'brand.caption',
                    },
                    entries: [],
                },
            ],
        });

        const resolved = resolveProjectBrand(project);
        const layer = resolved.scenes[0].layers[0] as {
            font_color: string;
            font_family?: string;
        };

        expect(resolved.scenes[0].background_color).toBe('#101010');
        expect(layer.font_color).toBe('#ff0055');
        expect(layer.font_family).toBe('Montserrat, sans-serif');
        expect(resolved.subtitle_tracks[0].style.highlight_color).toBe(
            '#ffcc00',
        );
        expect(resolved.subtitle_tracks[0].style.font_family).toBe(
            'Inter, sans-serif',
        );

        expect(project.scenes[0].background_color).toBe('brand.background');
        expect(
            (project.scenes[0].layers[0] as { font_color: string }).font_color,
        ).toBe('brand.primary');
    });

    it('resolveFrame paints resolved colours and fonts without touching the project', () => {
        const project = normalizeProject(
            makeProject({
                brand_kit: kit,
                scenes: [
                    makeScene({
                        background_color: 'brand.background',
                        layers: [
                            makeTextLayer({
                                id: 't',
                                font_color: 'brand.primary',
                                font_family: 'brand.display',
                                stroke_color: 'brand.accent',
                            }),
                            {
                                id: 'shape',
                                type: 'shape',
                                shape: 'rectangle',
                                x: 0,
                                y: 0,
                                width: 10,
                                height: 10,
                                z_index: 1,
                                fill_color: 'brand.accent',
                            },
                        ],
                    }),
                ],
                subtitle_tracks: [
                    {
                        id: 's',
                        name: 'Captions',
                        enabled: true,
                        style: {
                            font_size: 60,
                            font_color: 'brand.text',
                            background_color: 'transparent',
                            position: 'bottom',
                            highlight_color: 'brand.caption_highlight',
                        },
                        entries: [
                            { id: 'e', start_ms: 0, end_ms: 1000, text: 'hi' },
                        ],
                    },
                ],
            }),
        );

        const frame = resolveFrame(project, 100).primary;
        const text = frame.elements.find((element) => element.kind === 'text');
        const shape = frame.elements.find(
            (element) => element.kind === 'shape',
        );

        expect(frame.backgroundColor).toBe('#101010');
        expect(text && text.kind === 'text' ? text.color : null).toBe(
            '#ff0055',
        );
        expect(text && text.kind === 'text' ? text.fontFamily : null).toBe(
            'Montserrat, sans-serif',
        );
        expect(text && text.kind === 'text' ? text.strokeColor : null).toBe(
            '#ffcc00',
        );
        expect(shape && shape.kind === 'shape' ? shape.fillColor : null).toBe(
            '#ffcc00',
        );
        expect(frame.subtitles[0].color).toBe('#ffffff');
        expect(frame.subtitles[0].highlightColor).toBe('#ffcc00');
        expect(
            (project.scenes[0].layers[0] as { font_color: string }).font_color,
        ).toBe('brand.primary');
    });

    it('resolveFrame falls back for tokens when the project has no kit', () => {
        const project = normalizeProject(
            makeProject({
                scenes: [
                    makeScene({
                        layers: [
                            makeTextLayer({
                                id: 't',
                                font_color: 'brand.primary',
                            }),
                        ],
                    }),
                ],
            }),
        );
        const text = resolveFrame(project, 100).primary.elements[0];
        expect(text.kind === 'text' ? text.color : null).toBe(
            FALLBACK_BRAND_COLOR,
        );
    });
});
