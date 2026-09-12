import { describe, expect, it } from 'vitest';
import {
    clamp01,
    clampCornerRadius,
    computeFitRects,
    insetRect,
    isFiniteRect,
    isPaintableSize,
    outwardStrokeWidth,
} from '../geometry';

describe('computeFitRects', () => {
    it('stretches the whole source over the whole box for fill', () => {
        const rects = computeFitRects(100, 50, 200, 200, 'fill');

        expect(rects).toEqual({
            source: { x: 0, y: 0, width: 100, height: 50 },
            dest: { x: 0, y: 0, width: 200, height: 200 },
        });
    });

    it('letterboxes a wide source inside the box for contain', () => {
        const rects = computeFitRects(200, 100, 200, 200, 'contain');

        expect(rects?.source).toEqual({ x: 0, y: 0, width: 200, height: 100 });
        expect(rects?.dest).toEqual({ x: 0, y: 50, width: 200, height: 100 });
    });

    it('pillarboxes a tall source inside the box for contain', () => {
        const rects = computeFitRects(100, 200, 200, 200, 'contain');

        expect(rects?.dest).toEqual({ x: 50, y: 0, width: 100, height: 200 });
    });

    it('centre-crops the source and fills the box for cover', () => {
        const rects = computeFitRects(200, 100, 100, 100, 'cover');

        // Scale is 1 on the short axis, so half the width is cropped away.
        expect(rects?.source).toEqual({ x: 50, y: 0, width: 100, height: 100 });
        expect(rects?.dest).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    });

    it('crops vertically when the source is taller than the box', () => {
        const rects = computeFitRects(100, 400, 100, 100, 'cover');

        expect(rects?.source).toEqual({
            x: 0,
            y: 150,
            width: 100,
            height: 100,
        });
    });

    it('never samples outside the source on extreme aspect ratios', () => {
        for (const [sw, sh] of [
            [1, 10000],
            [10000, 1],
            [3, 5000],
        ]) {
            const rects = computeFitRects(sw, sh, 1920, 1080, 'cover');

            expect(rects).not.toBeNull();
            expect(rects!.source.x).toBeGreaterThanOrEqual(0);
            expect(rects!.source.y).toBeGreaterThanOrEqual(0);
            expect(rects!.source.x + rects!.source.width).toBeLessThanOrEqual(
                sw + 1e-9,
            );
            expect(rects!.source.y + rects!.source.height).toBeLessThanOrEqual(
                sh + 1e-9,
            );
        }
    });

    it('keeps contain inside the box on extreme aspect ratios', () => {
        const rects = computeFitRects(10000, 1, 1920, 1080, 'contain');

        expect(rects!.dest.width).toBeLessThanOrEqual(1920 + 1e-9);
        expect(rects!.dest.height).toBeLessThanOrEqual(1080 + 1e-9);
    });

    it('returns null for zero, negative and non-finite extents', () => {
        expect(computeFitRects(0, 100, 10, 10, 'cover')).toBeNull();
        expect(computeFitRects(100, 100, 0, 10, 'cover')).toBeNull();
        expect(computeFitRects(-100, 100, 10, 10, 'fill')).toBeNull();
        expect(computeFitRects(100, 100, 10, -10, 'contain')).toBeNull();
        expect(computeFitRects(NaN, 100, 10, 10, 'cover')).toBeNull();
        expect(computeFitRects(100, 100, Infinity, 10, 'cover')).toBeNull();
    });
});

describe('outwardStrokeWidth', () => {
    it('doubles the width so only the outer half survives the fill', () => {
        expect(outwardStrokeWidth(3)).toBe(6);
        expect(outwardStrokeWidth(0.5)).toBe(1);
    });

    it('is zero for absent, zero, negative and NaN widths', () => {
        expect(outwardStrokeWidth(0)).toBe(0);
        expect(outwardStrokeWidth(-4)).toBe(0);
        expect(outwardStrokeWidth(NaN)).toBe(0);
    });
});

describe('insetRect', () => {
    it('pulls the path in by half the border width on every side', () => {
        expect(insetRect({ x: 0, y: 0, width: 100, height: 40 }, 5)).toEqual({
            x: 5,
            y: 5,
            width: 90,
            height: 30,
        });
    });

    it('returns null once the border swallows the box', () => {
        expect(insetRect({ x: 0, y: 0, width: 10, height: 10 }, 5)).toBeNull();
        expect(insetRect({ x: 0, y: 0, width: 10, height: 10 }, 20)).toBeNull();
    });
});

describe('guards', () => {
    it('clamps alpha and maps NaN to zero', () => {
        expect(clamp01(0.4)).toBe(0.4);
        expect(clamp01(-1)).toBe(0);
        expect(clamp01(4)).toBe(1);
        expect(clamp01(NaN)).toBe(0);
    });

    it('caps a corner radius at half the shorter side', () => {
        expect(clampCornerRadius(100, 40, 80)).toBe(20);
        expect(clampCornerRadius(-5, 40, 80)).toBe(0);
        expect(clampCornerRadius(NaN, 40, 80)).toBe(0);
    });

    it('rejects non-finite rects and unpaintable sizes', () => {
        expect(isFiniteRect({ x: 0, y: 0, width: 1, height: 1 })).toBe(true);
        expect(isFiniteRect({ x: NaN, y: 0, width: 1, height: 1 })).toBe(false);
        expect(isPaintableSize(0, 10)).toBe(false);
        expect(isPaintableSize(10, 10)).toBe(true);
    });
});
