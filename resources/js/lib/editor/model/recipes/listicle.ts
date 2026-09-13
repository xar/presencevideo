import type { Layer, Scene } from '@/types/editor';
import {
    SAFE_AREA,
    assemble,
    beatStarts,
    mediaLayer,
    palette,
    px,
    shapeLayer,
    textLayer,
} from './shared';
import type { Recipe } from './types';

/**
 * "5 things…" — every body beat gets a numbered badge in the brand accent so
 * the viewer always knows where they are in the list.
 */
export const listicle: Recipe = {
    id: 'tiktok-listicle',
    name: 'Listicle',
    description:
        'Numbered beats: a hook headline, then each point with a brand-accent number badge and headline, karaoke captions, logo mark and outro.',
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
        let number = 0;

        const scenes: Scene[] = input.beats.map((beat, index) => {
            const layers: Layer[] = [];
            const media = mediaLayer(beat, canvas, 0);
            if (media) {
                layers.push(media);
            }

            const isBody = beat.kind === 'body';
            if (isBody) {
                number += 1;
                const badge = px(0.11, canvas.width);
                const box = {
                    x: px(SAFE_AREA.left, canvas.width),
                    y: px(SAFE_AREA.top, canvas.height),
                    width: badge,
                    height: badge,
                };
                layers.push(
                    shapeLayer(`${beat.id}:badge`, 'ellipse', box, p.accent, 9),
                );
                layers.push(
                    textLayer(
                        {
                            id: `${beat.id}:number`,
                            text: String(number),
                            x: SAFE_AREA.left,
                            y: SAFE_AREA.top,
                            width: badge / canvas.width,
                            height: badge / canvas.height,
                            fontFraction: 0.036,
                            color: p.background,
                            fontFamily: p.display,
                            zIndex: 10,
                            strokeWidth: 0,
                            durationMs: beat.duration_ms,
                        },
                        canvas,
                    ),
                );
            }

            const isHook = beat.kind === 'hook' || index === 0;
            layers.push(
                textLayer(
                    {
                        id: `${beat.id}:headline`,
                        text: beat.headline,
                        x: SAFE_AREA.left,
                        y: isBody
                            ? SAFE_AREA.top + 0.08
                            : isHook
                              ? SAFE_AREA.top
                              : 0.3,
                        width,
                        height: 0.2,
                        fontFraction: isHook ? 0.05 : 0.042,
                        color: beat.kind === 'cta' ? p.accent : p.text,
                        fontFamily: p.display,
                        zIndex: 11,
                        align: isBody ? 'left' : 'center',
                        motion: isBody ? 'slide-in-left' : 'pop-in',
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
                            y: isBody ? SAFE_AREA.top + 0.29 : 0.52,
                            width,
                            height: 0.1,
                            fontFraction: 0.032,
                            color: p.secondary,
                            fontFamily: p.body,
                            zIndex: 12,
                            bold: false,
                            align: isBody ? 'left' : 'center',
                            motion: 'fade-in',
                            durationMs: beat.duration_ms,
                            strokeWidth: media ? undefined : 0,
                        },
                        canvas,
                    ),
                );
            }

            return {
                id: beat.id,
                name: beat.headline || beat.kind,
                duration_ms: Math.max(0, Math.round(beat.duration_ms)),
                background_color: p.background,
                layers,
            };
        });

        return assemble(input, scenes, starts, p);
    },
};
