import { describe, expect, it } from 'vitest';
import {
    drawElement,
    drawFrame,
    drawResolvedFrame,
    sortedElements,
} from '../draw-frame';
import {
    emptyMedia,
    frame,
    mediaElement,
    mediaWith,
    shapeElement,
    subtitle,
    textElement,
} from './factories';
import { createFakeContext, saveBalance } from './fake-context';

describe('paint order', () => {
    it('paints the background, then elements by ascending z, then subtitles', () => {
        const ctx = createFakeContext();
        const media = mediaWith(100, 100);

        drawResolvedFrame(
            ctx,
            frame({
                width: 200,
                height: 100,
                elements: [
                    shapeElement({
                        id: 'top',
                        zIndex: 9,
                        fillColor: '#00ff00',
                    }),
                    mediaElement({ id: 'mid', zIndex: 5 }),
                    shapeElement({
                        id: 'bottom',
                        zIndex: 1,
                        fillColor: '#0000ff',
                    }),
                ],
                subtitles: [subtitle()],
            }),
            media,
        );

        const names = ctx.names();
        const background = names.indexOf('fillRect');
        const firstShapeFill = names.indexOf('fill');
        const image = names.indexOf('drawImage');
        const text = names.indexOf('fillText');

        expect(background).toBeLessThan(firstShapeFill);
        // The lowest shape is filled before the media element in the middle,
        // which is painted before the highest shape.
        expect(firstShapeFill).toBeLessThan(image);
        expect(image).toBeLessThan(names.lastIndexOf('fill'));
        // Subtitles are always last, above every element.
        expect(text).toBeGreaterThan(names.lastIndexOf('fill'));
    });

    it('orders by zIndex and keeps resolve order for ties', () => {
        const ordered = sortedElements(
            frame({
                elements: [
                    shapeElement({ id: 'c', zIndex: 2 }),
                    shapeElement({ id: 'a', zIndex: 1 }),
                    shapeElement({ id: 'b', zIndex: 1 }),
                ],
            }),
        );

        expect(ordered.map((element) => element.id)).toEqual(['a', 'b', 'c']);
    });

    it('fills the background across the whole frame', () => {
        const ctx = createFakeContext();

        drawResolvedFrame(ctx, frame({ width: 640, height: 360 }), emptyMedia);

        expect(ctx.calls('fillRect')[0].args).toEqual([0, 0, 640, 360]);
    });
});

describe('element transform', () => {
    it('rotates about the element centre and restores the layout origin', () => {
        const ctx = createFakeContext();

        drawElement(
            ctx,
            shapeElement({
                x: 100,
                y: 50,
                width: 200,
                height: 80,
                rotation: 90,
            }),
            emptyMedia,
        );

        expect(ctx.calls('translate').map((call) => call.args)).toEqual([
            [200, 90],
            [-100, -40],
        ]);
        expect(ctx.calls('rotate')[0].args[0]).toBeCloseTo(Math.PI / 2, 10);
    });

    it('does not rotate at all when the angle is zero', () => {
        const ctx = createFakeContext();

        drawElement(ctx, shapeElement(), emptyMedia);

        expect(ctx.calls('rotate')).toHaveLength(0);
    });

    it('applies the group alpha exactly once per element', () => {
        const ctx = createFakeContext();

        drawElement(
            ctx,
            textElement({
                opacity: 0.5,
                backgroundColor: '#000000',
                strokeColor: '#ff0000',
                strokeWidth: 2,
            }),
            emptyMedia,
        );

        expect(ctx.sets('globalAlpha')).toEqual([0.5]);
    });

    it('treats a NaN rotation as no rotation', () => {
        const ctx = createFakeContext();

        drawElement(ctx, shapeElement({ rotation: NaN }), emptyMedia);

        expect(ctx.calls('rotate')).toHaveLength(0);
        expect(saveBalance(ctx.log)).toEqual({ net: 0, min: 0 });
    });
});

describe('degenerate elements', () => {
    const cases = [
        ['zero width', shapeElement({ width: 0 })],
        ['zero height', shapeElement({ height: 0 })],
        ['negative size', shapeElement({ width: -10 })],
        ['NaN position', shapeElement({ x: NaN })],
        ['NaN size', shapeElement({ height: NaN })],
        ['zero opacity', shapeElement({ opacity: 0 })],
        ['NaN opacity', shapeElement({ opacity: NaN })],
    ] as const;

    it.each(cases)('draws nothing for %s', (_label, element) => {
        const ctx = createFakeContext();

        drawElement(ctx, element, emptyMedia);

        expect(ctx.log).toHaveLength(0);
    });

    it('stays save/restore balanced on every early return', () => {
        for (const [, element] of cases) {
            const ctx = createFakeContext();
            drawElement(ctx, element, emptyMedia);
            expect(saveBalance(ctx.log)).toEqual({ net: 0, min: 0 });
        }
    });
});

describe('media elements', () => {
    it('maps cover onto a centre-cropped source rect', () => {
        const ctx = createFakeContext();
        const media = mediaWith(200, 100);

        drawElement(
            ctx,
            mediaElement({ width: 100, height: 100, fit: 'cover' }),
            media,
        );

        expect(ctx.calls('drawImage')[0].args.slice(1)).toEqual([
            50, 0, 100, 100, 0, 0, 100, 100,
        ]);
    });

    it('letterboxes for contain and stretches for fill', () => {
        const contain = createFakeContext();
        drawElement(
            contain,
            mediaElement({ width: 100, height: 100, fit: 'contain' }),
            mediaWith(200, 100),
        );
        expect(contain.calls('drawImage')[0].args.slice(1)).toEqual([
            0, 0, 200, 100, 0, 25, 100, 50,
        ]);

        const fill = createFakeContext();
        drawElement(
            fill,
            mediaElement({ width: 100, height: 100, fit: 'fill' }),
            mediaWith(200, 100),
        );
        expect(fill.calls('drawImage')[0].args.slice(1)).toEqual([
            0, 0, 200, 100, 0, 0, 100, 100,
        ]);
    });

    it('asks the provider to hold the last frame for a null source time', () => {
        const media = mediaWith(100, 100);

        drawElement(
            createFakeContext(),
            mediaElement({ kind: 'video', sourceTimeSec: null }),
            media,
        );

        expect(media.videoCalls).toEqual([
            ['https://example.test/a.png', null],
        ]);
    });

    it('samples the requested source time for a video', () => {
        const media = mediaWith(100, 100);

        drawElement(
            createFakeContext(),
            mediaElement({ kind: 'video', sourceTimeSec: 2.5 }),
            media,
        );

        expect(media.videoCalls[0][1]).toBe(2.5);
    });

    it('draws nothing and never throws on a null url or a cache miss', () => {
        const nullUrl = createFakeContext();
        expect(() =>
            drawElement(nullUrl, mediaElement({ url: null }), emptyMedia),
        ).not.toThrow();
        expect(nullUrl.calls('drawImage')).toHaveLength(0);
        expect(saveBalance(nullUrl.log)).toEqual({ net: 0, min: 0 });

        const miss = createFakeContext();
        drawElement(miss, mediaElement(), emptyMedia);
        expect(miss.calls('drawImage')).toHaveLength(0);
        expect(saveBalance(miss.log)).toEqual({ net: 0, min: 0 });
    });

    it('ignores a source whose intrinsic size is not known yet', () => {
        const ctx = createFakeContext();
        const media = mediaWith(0, 0);

        drawElement(ctx, mediaElement(), media);

        expect(ctx.calls('drawImage')).toHaveLength(0);
    });

    it('still paints when adjustments are set but no offscreen surface exists', () => {
        const ctx = createFakeContext();

        expect(() =>
            drawElement(
                ctx,
                mediaElement({
                    adjustments: {
                        brightness: 0.3,
                        contrast: 1.2,
                        saturation: 0.5,
                    },
                }),
                mediaWith(100, 100),
            ),
        ).not.toThrow();

        // The unadjusted picture is the documented degraded fallback.
        expect(ctx.calls('drawImage')).toHaveLength(1);
        expect(saveBalance(ctx.log)).toEqual({ net: 0, min: 0 });
    });

    it('takes the direct path when adjustments are neutral', () => {
        const ctx = createFakeContext();

        drawElement(ctx, mediaElement(), mediaWith(100, 100));

        // One draw straight to the target: no offscreen round trip.
        expect(ctx.calls('drawImage')).toHaveLength(1);
        expect(ctx.calls('getImageData')).toHaveLength(0);
    });
});

describe('text elements', () => {
    it('fills the full element rect as the background, not a glyph box', () => {
        const ctx = createFakeContext();

        drawElement(
            ctx,
            textElement({
                width: 300,
                height: 120,
                backgroundColor: '#112233',
                backgroundRadius: 12,
                text: 'x',
            }),
            emptyMedia,
        );

        expect(ctx.calls('roundRect')[0].args).toEqual([0, 0, 300, 120, 12]);
        expect(ctx.sets('fillStyle')[0]).toBe('#112233');
    });

    it('clips the glyphs to the element box', () => {
        const ctx = createFakeContext();

        drawElement(
            ctx,
            textElement({ text: 'wrapped text here' }),
            emptyMedia,
        );

        const names = ctx.names();
        expect(names.indexOf('clip')).toBeLessThan(names.indexOf('fillText'));
        expect(saveBalance(ctx.log)).toEqual({ net: 0, min: 0 });
    });

    it('strokes at twice the width and under the fill', () => {
        const ctx = createFakeContext();

        drawElement(
            ctx,
            textElement({ text: 'ab', strokeColor: '#000000', strokeWidth: 3 }),
            emptyMedia,
        );

        expect(ctx.sets('lineWidth')).toContain(6);
        const names = ctx.names();
        expect(names.indexOf('strokeText')).toBeLessThan(
            names.indexOf('fillText'),
        );
    });

    it('wraps text that does not fit the box', () => {
        const ctx = createFakeContext({ charWidth: 10 });

        drawElement(
            ctx,
            textElement({ width: 50, height: 200, text: 'aaaa bbbb cccc' }),
            emptyMedia,
        );

        expect(ctx.calls('fillText').length).toBeGreaterThan(1);
    });

    it('falls back to per-glyph placement without native letter spacing', () => {
        const ctx = createFakeContext({ letterSpacing: false, charWidth: 10 });

        drawElement(
            ctx,
            textElement({ width: 400, text: 'abc', letterSpacing: 4 }),
            emptyMedia,
        );

        const calls = ctx.calls('fillText');
        expect(calls).toHaveLength(3);
        expect(calls.map((call) => call.args[0])).toEqual(['a', 'b', 'c']);
        // Each glyph advances by its own width plus the tracking.
        expect(calls[1].args[1]).toBe(14);
        expect(calls[2].args[1]).toBe(28);
    });

    it('still paints the background but no glyphs for empty text', () => {
        const ctx = createFakeContext();

        drawElement(
            ctx,
            textElement({ text: '', backgroundColor: '#000000' }),
            emptyMedia,
        );

        expect(ctx.calls('fill')).toHaveLength(1);
        expect(ctx.calls('fillText')).toHaveLength(0);
        expect(saveBalance(ctx.log)).toEqual({ net: 0, min: 0 });
    });

    it('draws nothing at all for empty text with no background', () => {
        const ctx = createFakeContext();

        drawElement(ctx, textElement({ text: '' }), emptyMedia);

        expect(ctx.calls('fill')).toHaveLength(0);
        expect(ctx.calls('fillText')).toHaveLength(0);
    });

    it('skips a non-positive font size without throwing', () => {
        const ctx = createFakeContext();

        expect(() =>
            drawElement(ctx, textElement({ fontSize: 0 }), emptyMedia),
        ).not.toThrow();
        expect(ctx.calls('fillText')).toHaveLength(0);
    });
});

describe('shape elements', () => {
    it('uses an antialiased ellipse path rather than an alpha threshold', () => {
        const ctx = createFakeContext();

        drawElement(
            ctx,
            shapeElement({ shape: 'ellipse', width: 100, height: 60 }),
            emptyMedia,
        );

        expect(ctx.calls('ellipse')[0].args.slice(0, 4)).toEqual([
            50, 30, 50, 30,
        ]);
        expect(ctx.calls('fill')).toHaveLength(1);
    });

    it('rounds rectangle corners through the native path', () => {
        const ctx = createFakeContext();

        drawElement(
            ctx,
            shapeElement({ width: 100, height: 60, cornerRadius: 10 }),
            emptyMedia,
        );

        expect(ctx.calls('roundRect')[0].args).toEqual([0, 0, 100, 60, 10]);
    });

    it('caps the corner radius at half the shorter side', () => {
        const ctx = createFakeContext();

        drawElement(
            ctx,
            shapeElement({ width: 100, height: 60, cornerRadius: 999 }),
            emptyMedia,
        );

        expect(ctx.calls('roundRect')[0].args[4]).toBe(30);
    });

    it('draws a line as a thin bar with no arrow heads', () => {
        const ctx = createFakeContext();

        drawElement(
            ctx,
            shapeElement({ shape: 'line', width: 200, height: 4 }),
            emptyMedia,
        );

        expect(ctx.calls('rect')[0].args).toEqual([0, 0, 200, 4]);
        expect(ctx.calls('ellipse')).toHaveLength(0);
    });

    it('defaults a border with no colour to black', () => {
        const ctx = createFakeContext();

        drawElement(
            ctx,
            shapeElement({
                borderWidth: 4,
                borderColor: null,
                fillColor: null,
            }),
            emptyMedia,
        );

        expect(ctx.sets('strokeStyle')).toEqual(['#000000']);
        expect(ctx.calls('stroke')).toHaveLength(1);
    });

    it('insets the border so it stays inside the element box', () => {
        const ctx = createFakeContext();

        drawElement(
            ctx,
            shapeElement({
                width: 100,
                height: 60,
                fillColor: null,
                borderWidth: 10,
                borderColor: '#ff00ff',
            }),
            emptyMedia,
        );

        expect(ctx.calls('rect')[0].args).toEqual([5, 5, 90, 50]);
        expect(ctx.sets('lineWidth')).toContain(10);
    });

    it('draws nothing with neither a fill nor a border', () => {
        const ctx = createFakeContext();

        drawElement(
            ctx,
            shapeElement({ fillColor: null, borderWidth: 0 }),
            emptyMedia,
        );

        expect(ctx.calls('fill')).toHaveLength(0);
        expect(ctx.calls('stroke')).toHaveLength(0);
        expect(saveBalance(ctx.log)).toEqual({ net: 0, min: 0 });
    });

    it('skips a border thicker than the box it would sit in', () => {
        const ctx = createFakeContext();

        drawElement(
            ctx,
            shapeElement({
                width: 10,
                height: 10,
                fillColor: null,
                borderWidth: 40,
                borderColor: '#fff',
            }),
            emptyMedia,
        );

        expect(ctx.calls('stroke')).toHaveLength(0);
    });
});

describe('drawFrame', () => {
    it('paints the primary frame directly when there is no transition', () => {
        const ctx = createFakeContext();

        drawFrame(
            ctx,
            { primary: frame({ elements: [shapeElement()] }) },
            emptyMedia,
        );

        expect(ctx.calls('fill')).toHaveLength(1);
        expect(saveBalance(ctx.log)).toEqual({ net: 0, min: 0 });
    });

    it('falls back to the dominant frame when no scratch surface exists', () => {
        // jsdom cannot create a 2D context, which is exactly the degraded case
        // this fallback exists for.
        const early = createFakeContext();
        drawFrame(
            early,
            {
                primary: frame({ backgroundColor: '#111111' }),
                transition: {
                    type: 'fade',
                    progress: 0.1,
                    incoming: frame({ backgroundColor: '#222222' }),
                },
            },
            emptyMedia,
        );
        expect(early.sets('fillStyle')).toEqual(['#111111']);

        const late = createFakeContext();
        drawFrame(
            late,
            {
                primary: frame({ backgroundColor: '#111111' }),
                transition: {
                    type: 'fade',
                    progress: 0.9,
                    incoming: frame({ backgroundColor: '#222222' }),
                },
            },
            emptyMedia,
        );
        expect(late.sets('fillStyle')).toEqual(['#222222']);
    });

    it('never throws on an empty frame', () => {
        const ctx = createFakeContext();

        expect(() =>
            drawFrame(ctx, { primary: frame() }, emptyMedia),
        ).not.toThrow();
        expect(saveBalance(ctx.log)).toEqual({ net: 0, min: 0 });
    });
});
