import { describe, expect, it } from 'vitest';
import { applyEasing } from '../easing';
import {
    applyKeyframes,
    readProperty,
    sampleKeyframes,
    sortKeyframes
    
} from '../keyframes';
import type {Keyframe} from '../keyframes';

describe('applyEasing', () => {
    it('is the identity for linear progress', () => {
        expect(applyEasing(0, 'linear')).toBe(0);
        expect(applyEasing(0.37, 'linear')).toBeCloseTo(0.37, 6);
        expect(applyEasing(1, 'linear')).toBe(1);
    });

    it('pins every curve to 0 and 1 at the endpoints', () => {
        for (const easing of ['ease', 'ease-in', 'ease-out', 'ease-in-out'] as const) {
            expect(applyEasing(0, easing)).toBeCloseTo(0, 6);
            expect(applyEasing(1, easing)).toBeCloseTo(1, 6);
        }
    });

    it('starts slower than linear for ease-in and faster for ease-out', () => {
        expect(applyEasing(0.25, 'ease-in')).toBeLessThan(0.25);
        expect(applyEasing(0.25, 'ease-out')).toBeGreaterThan(0.25);
    });

    it('holds at the outgoing value until the segment completes', () => {
        expect(applyEasing(0.99, 'hold')).toBe(0);
        expect(applyEasing(1, 'hold')).toBe(1);
    });

    it('clamps progress instead of extrapolating', () => {
        expect(applyEasing(-2, 'ease-in-out')).toBe(0);
        expect(applyEasing(4, 'ease-in-out')).toBe(1);
    });

    it('accepts custom cubic-bezier control points', () => {
        // Matches the named curve it duplicates, proving the solver path.
        expect(applyEasing(0.4, [0.42, 0, 1, 1])).toBeCloseTo(applyEasing(0.4, 'ease-in'), 6);
    });

    it('solves curves whose control points flatten the slope', () => {
        const value = applyEasing(0.5, [0, 0, 1, 1]);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
    });
});

describe('sampleKeyframes', () => {
    const fade: Keyframe[] = [
        { time_ms: 0, value: 0 },
        { time_ms: 1000, value: 1 },
    ];

    it('returns null with no track so callers fall back to the static value', () => {
        expect(sampleKeyframes(undefined, 0)).toBeNull();
        expect(sampleKeyframes([], 0)).toBeNull();
    });

    it('returns the only value of a single-keyframe track at any time', () => {
        const track = [{ time_ms: 500, value: 0.5 }];
        expect(sampleKeyframes(track, 0)).toBe(0.5);
        expect(sampleKeyframes(track, 9999)).toBe(0.5);
    });

    it('interpolates linearly between keyframes', () => {
        expect(sampleKeyframes(fade, 0)).toBe(0);
        expect(sampleKeyframes(fade, 250)).toBeCloseTo(0.25, 6);
        expect(sampleKeyframes(fade, 1000)).toBe(1);
    });

    it('holds the endpoints outside the authored range', () => {
        expect(sampleKeyframes(fade, -500)).toBe(0);
        expect(sampleKeyframes(fade, 5000)).toBe(1);
    });

    it('applies the outgoing keyframe easing to its own segment only', () => {
        const track: Keyframe[] = [
            { time_ms: 0, value: 0, easing: 'ease-in' },
            { time_ms: 1000, value: 100, easing: 'linear' },
            { time_ms: 2000, value: 200 },
        ];

        expect(sampleKeyframes(track, 250)).toBeLessThan(25);
        expect(sampleKeyframes(track, 1500)).toBeCloseTo(150, 6);
    });

    it('sorts unsorted tracks before sampling', () => {
        const unsorted: Keyframe[] = [
            { time_ms: 1000, value: 1 },
            { time_ms: 0, value: 0 },
        ];

        expect(sampleKeyframes(unsorted, 500)).toBeCloseTo(0.5, 6);
    });

    it('treats keyframes stacked on one millisecond as an instant cut', () => {
        const track: Keyframe[] = [
            { time_ms: 0, value: 0 },
            { time_ms: 500, value: 0 },
            { time_ms: 500, value: 1 },
            { time_ms: 1000, value: 1 },
        ];

        expect(sampleKeyframes(track, 499)).toBeCloseTo(0, 3);
        expect(sampleKeyframes(track, 500)).toBe(1);
    });

    it('does not mutate the caller track when sorting', () => {
        const unsorted: Keyframe[] = [
            { time_ms: 1000, value: 1 },
            { time_ms: 0, value: 0 },
        ];
        sampleKeyframes(unsorted, 500);
        expect(unsorted[0].time_ms).toBe(1000);
        expect(sortKeyframes(unsorted)[0].time_ms).toBe(0);
    });
});

describe('applyKeyframes', () => {
    const element = {
        id: 'a',
        x: 10,
        y: 20,
        opacity: 1,
        adjustments: { brightness: 0, contrast: 1 },
    };

    it('returns the identical object when there are no tracks', () => {
        expect(applyKeyframes(element, undefined, 0)).toBe(element);
        expect(applyKeyframes(element, {}, 0)).toBe(element);
    });

    it('overlays animated properties without touching the static ones', () => {
        const resolved = applyKeyframes(
            element,
            {
                x: [
                    { time_ms: 0, value: 0 },
                    { time_ms: 1000, value: 100 },
                ],
            },
            500,
        );

        expect(resolved.x).toBeCloseTo(50, 6);
        expect(resolved.y).toBe(20);
        expect(resolved.id).toBe('a');
    });

    it('never writes back into the source element or its nested objects', () => {
        const resolved = applyKeyframes(
            element,
            { 'adjustments.brightness': [{ time_ms: 0, value: 0.5 }] },
            0,
        );

        expect(readProperty(resolved, 'adjustments.brightness')).toBe(0.5);
        expect(element.adjustments.brightness).toBe(0);
        expect(resolved.adjustments).not.toBe(element.adjustments);
        expect(readProperty(resolved, 'adjustments.contrast')).toBe(1);
    });

    it('leaves a property static when its track cannot be sampled', () => {
        const resolved = applyKeyframes(element, { opacity: [] }, 0);
        expect(resolved).toBe(element);
        expect(resolved.opacity).toBe(1);
    });
});
