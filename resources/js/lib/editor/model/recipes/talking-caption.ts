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
 * Talking-head / UGC shape: the footage carries the video, a slim brand title
 * bar at the top names the topic, and word-by-word captions do the work.
 */
export const talkingCaption: Recipe = {
    id: 'tiktok-talking-caption',
    name: 'Talking head with captions',
    description:
        'Footage-first: a brand title bar in the safe area, karaoke captions from the voiceover, logo mark and outro. Best for UGC and explainers.',
    slots: {
        colors: ['primary', 'background', 'text', 'caption_highlight'],
        fonts: ['display', 'caption'],
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

        const scenes: Scene[] = input.beats.map((beat) => {
            const layers: Layer[] = [];
            const media = mediaLayer(beat, canvas, 0);
            if (media) {
                layers.push(media);
            }

            const barHeight = 0.09;
            layers.push(
                shapeLayer(
                    `${beat.id}:bar`,
                    'rectangle',
                    {
                        x: px(SAFE_AREA.left, canvas.width),
                        y: px(SAFE_AREA.top, canvas.height),
                        width: px(width, canvas.width),
                        height: px(barHeight, canvas.height),
                    },
                    p.primary,
                    9,
                    { corner_radius: px(0.012, canvas.height), opacity: 0.92 },
                ),
            );
            layers.push(
                textLayer(
                    {
                        id: `${beat.id}:headline`,
                        text: beat.headline,
                        x: SAFE_AREA.left,
                        y: SAFE_AREA.top,
                        width,
                        height: barHeight,
                        fontFraction: 0.034,
                        color: p.background,
                        fontFamily: p.display,
                        zIndex: 10,
                        strokeWidth: 0,
                        motion: 'slide-in-up',
                        durationMs: beat.duration_ms,
                    },
                    canvas,
                ),
            );

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
