import type { Layer, Scene } from '@/types/editor';
import {
    SAFE_AREA,
    assemble,
    beatStarts,
    mediaLayer,
    palette,
    textLayer,
} from './shared';
import type { Recipe, RecipeBeat } from './types';

/**
 * The default short-form shape: a hook headline over full-bleed media, body
 * beats with a headline and a supporting line, and a centred call to action.
 */
export const hookBodyCta: Recipe = {
    id: 'tiktok-hook-body-cta',
    name: 'Hook / body / CTA',
    description:
        'Full-bleed media per beat with a bold headline in the safe area, a supporting line, karaoke captions, brand logo mark and outro.',
    slots: {
        colors: [
            'primary',
            'accent',
            'background',
            'text',
            'caption_highlight',
        ],
        fonts: ['display', 'body', 'caption'],
        logo: true,
        outro: true,
        watermark: false,
        voice: true,
        music: true,
    },
    build(input) {
        const canvas = input.canvas;
        const p = palette(input.brand);
        const starts = beatStarts(input.beats);
        const width = SAFE_AREA.right - SAFE_AREA.left;

        const scenes: Scene[] = input.beats.map((beat: RecipeBeat, index) => {
            const layers: Layer[] = [];
            const media = mediaLayer(beat, canvas, 0);
            if (media) {
                layers.push(media);
            }

            const isHook = beat.kind === 'hook' || index === 0;
            const isCta = beat.kind === 'cta';

            layers.push(
                textLayer(
                    {
                        id: `${beat.id}:headline`,
                        text: beat.headline,
                        x: SAFE_AREA.left,
                        y: isCta ? 0.3 : SAFE_AREA.top,
                        width,
                        height: isCta ? 0.22 : 0.2,
                        fontFraction: isHook ? 0.05 : 0.042,
                        color: isCta ? p.accent : p.text,
                        fontFamily: p.display,
                        zIndex: 10,
                        motion: 'pop-in',
                        durationMs: beat.duration_ms,
                        strokeWidth: media ? undefined : 0,
                    },
                    canvas,
                ),
            );

            if (beat.sub) {
                layers.push(
                    textLayer(
                        {
                            id: `${beat.id}:sub`,
                            text: beat.sub,
                            x: SAFE_AREA.left,
                            y: isCta ? 0.54 : 0.34,
                            width,
                            height: 0.1,
                            fontFraction: 0.032,
                            color: isCta ? p.text : p.secondary,
                            fontFamily: p.body,
                            zIndex: 11,
                            bold: false,
                            motion: 'fade-in',
                            durationMs: beat.duration_ms,
                            strokeWidth: media ? undefined : 0,
                        },
                        canvas,
                    ),
                );
            }

            const scene: Scene = {
                id: beat.id,
                name: beat.headline || beat.kind,
                duration_ms: Math.max(0, Math.round(beat.duration_ms)),
                background_color: p.background,
                layers,
            };

            if (index < input.beats.length - 1) {
                scene.transition = { type: 'fade', duration_ms: 250 };
            }

            return scene;
        });

        return assemble(input, scenes, starts, p);
    },
};
