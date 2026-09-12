import { describe, expect, it } from 'vitest';
import {
    applyEqToRgba,
    eqPixel,
    isNeutralAdjustments,
    NEUTRAL_ADJUSTMENTS,
} from '../color-eq';

const neutral = NEUTRAL_ADJUSTMENTS;

function rgba(pixels: number[][]): Uint8ClampedArray {
    const data = new Uint8ClampedArray(pixels.length * 4);
    pixels.forEach(([r, g, b, a], index) => {
        data[index * 4] = r;
        data[index * 4 + 1] = g;
        data[index * 4 + 2] = b;
        data[index * 4 + 3] = a ?? 255;
    });

    return data;
}

describe('isNeutralAdjustments', () => {
    it('treats the ffmpeg neutral values as a no-op', () => {
        expect(isNeutralAdjustments(neutral)).toBe(true);
        expect(isNeutralAdjustments(null)).toBe(true);
        expect(isNeutralAdjustments(undefined)).toBe(true);
    });

    it('detects any single non-neutral channel', () => {
        expect(isNeutralAdjustments({ ...neutral, brightness: 0.1 })).toBe(
            false,
        );
        expect(isNeutralAdjustments({ ...neutral, contrast: 1.2 })).toBe(false);
        expect(isNeutralAdjustments({ ...neutral, saturation: 0 })).toBe(false);
    });

    it('ignores NaN rather than treating it as an adjustment', () => {
        expect(
            isNeutralAdjustments({
                brightness: NaN,
                contrast: NaN,
                saturation: NaN,
            }),
        ).toBe(true);
    });
});

describe('eqPixel', () => {
    it('is an exact identity at the neutral values', () => {
        for (const [r, g, b] of [
            [0, 0, 0],
            [255, 255, 255],
            [17, 200, 43],
            [128, 128, 128],
        ]) {
            expect(eqPixel(r, g, b, neutral)).toEqual([r, g, b]);
        }
    });

    it('adds an offset to luma for brightness, as ffmpeg eq does', () => {
        const [r, g, b] = eqPixel(100, 100, 100, {
            ...neutral,
            brightness: 0.2,
        });

        // +0.2 * 255 = +51 on the luma of a grey, applied additively.
        expect(r).toBe(151);
        expect(g).toBe(151);
        expect(b).toBe(151);
    });

    it('darkens for negative brightness', () => {
        const [r] = eqPixel(100, 100, 100, { ...neutral, brightness: -0.2 });

        expect(r).toBe(49);
    });

    it('is additive, not multiplicative like the old CSS filter', () => {
        // A CSS `brightness(0.5)` would halve black to black; ffmpeg's additive
        // offset lifts it instead. Black + 0.5 must not stay black.
        const [r] = eqPixel(0, 0, 0, { ...neutral, brightness: 0.5 });

        expect(r).toBeGreaterThan(100);
    });

    it('scales luma about mid-grey for contrast', () => {
        expect(eqPixel(128, 128, 128, { ...neutral, contrast: 2 })).toEqual([
            128, 128, 128,
        ]);

        const [bright] = eqPixel(200, 200, 200, { ...neutral, contrast: 2 });
        const [dark] = eqPixel(60, 60, 60, { ...neutral, contrast: 2 });

        expect(bright).toBeGreaterThan(200);
        expect(dark).toBeLessThan(60);
    });

    it('collapses colour to grey at zero saturation and keeps luma', () => {
        const [r, g, b] = eqPixel(255, 0, 0, { ...neutral, saturation: 0 });

        expect(r).toBe(g);
        expect(g).toBe(b);
        // BT.601 luma of pure red.
        expect(r).toBeCloseTo(76, 0);
    });

    it('pushes colour further from grey above 1', () => {
        const [, g] = eqPixel(200, 100, 100, { ...neutral, saturation: 1.5 });
        const [, baseG] = eqPixel(200, 100, 100, neutral);

        expect(g).toBeLessThan(baseG);
    });

    it('clamps at 0 and 255 instead of wrapping', () => {
        expect(eqPixel(255, 255, 255, { ...neutral, brightness: 1 })).toEqual([
            255, 255, 255,
        ]);
        expect(eqPixel(0, 0, 0, { ...neutral, brightness: -1 })).toEqual([
            0, 0, 0,
        ]);
        expect(eqPixel(255, 0, 0, { ...neutral, saturation: 8 })).toEqual([
            255, 0, 0,
        ]);
    });
});

describe('applyEqToRgba', () => {
    it('leaves the buffer untouched for neutral adjustments', () => {
        const data = rgba([
            [10, 20, 30],
            [200, 100, 50],
        ]);
        const before = Uint8ClampedArray.from(data);

        applyEqToRgba(data, neutral);

        expect(Array.from(data)).toEqual(Array.from(before));
    });

    it('matches the per-pixel transform', () => {
        const adjustments = { brightness: 0.1, contrast: 1.3, saturation: 0.7 };
        const data = rgba([
            [10, 20, 30],
            [200, 100, 50],
        ]);

        applyEqToRgba(data, adjustments);

        for (const [index, source] of [
            [0, [10, 20, 30]],
            [1, [200, 100, 50]],
        ] as [number, number[]][]) {
            const expected = eqPixel(
                source[0],
                source[1],
                source[2],
                adjustments,
            );
            expect(data[index * 4]).toBeCloseTo(expected[0], -0.4);
            expect(data[index * 4 + 1]).toBeCloseTo(expected[1], -0.4);
            expect(data[index * 4 + 2]).toBeCloseTo(expected[2], -0.4);
        }
    });

    it('preserves alpha and skips fully transparent pixels', () => {
        const data = rgba([
            [10, 20, 30, 0],
            [10, 20, 30, 128],
        ]);

        applyEqToRgba(data, { brightness: 0.5, contrast: 1, saturation: 1 });

        expect(Array.from(data.slice(0, 4))).toEqual([10, 20, 30, 0]);
        expect(data[7]).toBe(128);
        expect(data[4]).toBeGreaterThan(10);
    });
});
