import { describe, expect, it } from 'vitest';
import { sampleKeyframes } from '../keyframes';
import {
    applyMotionPreset,
    findMotionPreset,
    MOTION_PRESETS
    
} from '../motion-presets';
import type {MotionContext} from '../motion-presets';

const context: MotionContext = {
    durationMs: 4000,
    x: 100,
    y: 200,
    width: 400,
    height: 300,
    canvasWidth: 1920,
    canvasHeight: 1080,
};

describe('motion presets', () => {
    it('every preset builds at least one non-empty track', () => {
        for (const preset of MOTION_PRESETS) {
            const tracks = preset.build(context);
            const entries = Object.entries(tracks);
            expect(entries.length, preset.id).toBeGreaterThan(0);

            for (const [property, keyframes] of entries) {
                expect(keyframes?.length, `${preset.id}.${property}`).toBeGreaterThanOrEqual(2);
            }
        }
    });

    it('every preset keeps keyframes inside the element lifetime', () => {
        for (const preset of MOTION_PRESETS) {
            for (const [property, keyframes] of Object.entries(preset.build(context))) {
                for (const keyframe of keyframes ?? []) {
                    expect(keyframe.time_ms, `${preset.id}.${property}`).toBeGreaterThanOrEqual(0);
                    expect(keyframe.time_ms, `${preset.id}.${property}`).toBeLessThanOrEqual(
                        context.durationMs,
                    );
                }
            }
        }
    });

    it('fades in from fully transparent to fully opaque', () => {
        const tracks = findMotionPreset('fade-in')!.build(context);
        expect(sampleKeyframes(tracks.opacity, 0)).toBe(0);
        expect(sampleKeyframes(tracks.opacity, 500)).toBe(1);
        expect(sampleKeyframes(tracks.opacity, 4000)).toBe(1);
    });

    it('fades out only at the end of the element', () => {
        const tracks = findMotionPreset('fade-out')!.build(context);
        expect(sampleKeyframes(tracks.opacity, 0)).toBe(1);
        expect(sampleKeyframes(tracks.opacity, 3500)).toBe(1);
        expect(sampleKeyframes(tracks.opacity, 4000)).toBe(0);
    });

    it('shortens its ramp rather than never completing on a brief element', () => {
        const brief = { ...context, durationMs: 200 };
        const tracks = findMotionPreset('fade-in')!.build(brief);
        expect(sampleKeyframes(tracks.opacity, 200)).toBe(1);
        expect(sampleKeyframes(tracks.opacity, 80)).toBe(1);
    });

    it('zooms Ken Burns about the centre, keeping the midpoint fixed', () => {
        const tracks = findMotionPreset('ken-burns-in')!.build(context);
        const centreXAt = (time: number) =>
            sampleKeyframes(tracks.x, time)! + sampleKeyframes(tracks.width, time)! / 2;
        const centreYAt = (time: number) =>
            sampleKeyframes(tracks.y, time)! + sampleKeyframes(tracks.height, time)! / 2;

        expect(centreXAt(0)).toBeCloseTo(300, 6);
        expect(centreXAt(4000)).toBeCloseTo(300, 6);
        expect(centreYAt(0)).toBeCloseTo(350, 6);
        expect(centreYAt(4000)).toBeCloseTo(350, 6);
        expect(sampleKeyframes(tracks.width, 4000)).toBeGreaterThan(
            sampleKeyframes(tracks.width, 0)!,
        );
    });

    it('starts a left slide fully off canvas and lands on the authored position', () => {
        const tracks = findMotionPreset('slide-in-left')!.build(context);
        expect(sampleKeyframes(tracks.x, 0)).toBe(-context.width);
        expect(sampleKeyframes(tracks.x, context.durationMs)).toBe(context.x);
    });

    it('starts a right slide off the far edge', () => {
        const tracks = findMotionPreset('slide-in-right')!.build(context);
        expect(sampleKeyframes(tracks.x, 0)).toBe(context.canvasWidth);
        expect(sampleKeyframes(tracks.x, context.durationMs)).toBe(context.x);
    });

    it('replaces the property tracks it owns and keeps the others', () => {
        const existing = {
            rotation: [
                { time_ms: 0, value: 0 },
                { time_ms: 1000, value: 90 },
            ],
            opacity: [{ time_ms: 0, value: 0.5 }],
        };

        const merged = applyMotionPreset(existing, 'fade-in', context);

        expect(merged.rotation).toBe(existing.rotation);
        expect(sampleKeyframes(merged.opacity, 0)).toBe(0);
        expect(sampleKeyframes(merged.opacity, 500)).toBe(1);
    });

    it('is idempotent when applied twice', () => {
        const once = applyMotionPreset(undefined, 'ken-burns-in', context);
        const twice = applyMotionPreset(once, 'ken-burns-in', context);
        expect(twice).toEqual(once);
    });
});
