import { beforeEach, describe, expect, it } from 'vitest';
import type { TransitionType } from '@/types/editor';
import {
    coveringRadius,
    dissolveNoise,
    drawTransition,
    releaseDissolveNoise,
    transitionPlan,
    writeDissolveMask,
} from '../transitions';
import { createFakeContext, fakeImage, saveBalance } from './fake-context';

const ALL_TYPES: TransitionType[] = [
    'fade',
    'fadeblack',
    'fadewhite',
    'slideleft',
    'slideright',
    'slideup',
    'slidedown',
    'wipeleft',
    'wiperight',
    'circleopen',
    'circleclose',
    'dissolve',
];

const W = 1920;
const H = 1080;

describe('transitionPlan endpoints', () => {
    it('covers every transition type', () => {
        expect(ALL_TYPES).toHaveLength(12);
    });

    it.each(ALL_TYPES)(
        'shows only the outgoing frame at progress 0 (%s)',
        (type) => {
            const plan = transitionPlan(type, 0, W, H);

            expect(plan.outgoingAlpha).toBe(1);
            expect(plan.outgoingOffset).toEqual({ x: 0, y: 0 });
            expect(plan.veilAlpha).toBe(0);
            // Nothing of the incoming frame is visible: either it is transparent or
            // it covers none of the canvas.
            expect(plan.incomingAlpha * plan.incomingCoverage).toBe(0);
        },
    );

    it.each(ALL_TYPES)(
        'shows only the incoming frame at progress 1 (%s)',
        (type) => {
            const plan = transitionPlan(type, 1, W, H);

            expect(plan.incomingAlpha).toBe(1);
            expect(plan.incomingCoverage).toBe(1);
            expect(plan.incomingOffset).toEqual({ x: 0, y: 0 });
            expect(plan.veilAlpha).toBe(0);

            if (plan.incomingClipRect) {
                expect(plan.incomingClipRect).toEqual({
                    x: 0,
                    y: 0,
                    width: W,
                    height: H,
                });
            }

            if (plan.incomingClipCircle) {
                // A grown circle must reach the corners; a closed one must vanish.
                if (plan.incomingClipCircle.inverted) {
                    expect(plan.incomingClipCircle.radius).toBe(0);
                } else {
                    expect(
                        plan.incomingClipCircle.radius,
                    ).toBeGreaterThanOrEqual(coveringRadius(W, H));
                }
            }

            if (plan.dissolveThreshold !== null) {
                expect(plan.dissolveThreshold).toBe(1);
            }
        },
    );

    it.each(ALL_TYPES)(
        'clamps progress rather than extrapolating (%s)',
        (type) => {
            expect(transitionPlan(type, -3, W, H)).toEqual(
                transitionPlan(type, 0, W, H),
            );
            expect(transitionPlan(type, 7, W, H)).toEqual(
                transitionPlan(type, 1, W, H),
            );
        },
    );
});

describe('transition shapes', () => {
    it('crossfades rather than fading through black for fade', () => {
        const plan = transitionPlan('fade', 0.5, W, H);

        expect(plan.veilColor).toBeNull();
        expect(plan.incomingAlpha).toBe(0.5);
        expect(plan.incomingCoverage).toBe(1);
    });

    it('is fully opaque in the colour at the midpoint of fadeblack', () => {
        expect(transitionPlan('fadeblack', 0.5, W, H)).toMatchObject({
            veilColor: '#000000',
            veilAlpha: 1,
        });
        expect(transitionPlan('fadewhite', 0.5, W, H).veilColor).toBe(
            '#ffffff',
        );
    });

    it('keeps the outgoing frame under the veil in the first half', () => {
        const plan = transitionPlan('fadeblack', 0.25, W, H);

        expect(plan.incomingAlpha).toBe(0);
        expect(plan.veilAlpha).toBeCloseTo(0.5, 6);
    });

    it('slides the incoming frame in while the outgoing one leaves', () => {
        const left = transitionPlan('slideleft', 0.25, W, H);
        expect(left.outgoingOffset.x).toBeCloseTo(-W * 0.25, 6);
        expect(left.incomingOffset.x).toBeCloseTo(W * 0.75, 6);

        const right = transitionPlan('slideright', 0.25, W, H);
        expect(right.outgoingOffset.x).toBeCloseTo(W * 0.25, 6);
        expect(right.incomingOffset.x).toBeCloseTo(-W * 0.75, 6);

        const up = transitionPlan('slideup', 0.25, W, H);
        expect(up.outgoingOffset.y).toBeCloseTo(-H * 0.25, 6);
        expect(up.incomingOffset.y).toBeCloseTo(H * 0.75, 6);

        const down = transitionPlan('slidedown', 0.25, W, H);
        expect(down.outgoingOffset.y).toBeCloseTo(H * 0.25, 6);
        expect(down.incomingOffset.y).toBeCloseTo(-H * 0.75, 6);
    });

    it('reveals from the opposite edge for the two wipes', () => {
        expect(transitionPlan('wipeleft', 0.25, W, H).incomingClipRect).toEqual(
            {
                x: W * 0.75,
                y: 0,
                width: W * 0.25,
                height: H,
            },
        );
        expect(
            transitionPlan('wiperight', 0.25, W, H).incomingClipRect,
        ).toEqual({
            x: 0,
            y: 0,
            width: W * 0.25,
            height: H,
        });
    });

    it('grows and shrinks a centred circle', () => {
        const open = transitionPlan('circleopen', 0.5, W, H);
        const close = transitionPlan('circleclose', 0.5, W, H);

        expect(open.incomingClipCircle).toMatchObject({
            cx: W / 2,
            cy: H / 2,
            inverted: false,
        });
        expect(open.incomingClipCircle!.radius).toBeCloseTo(
            coveringRadius(W, H) * 0.5,
            6,
        );
        expect(close.incomingClipCircle!.inverted).toBe(true);
        expect(close.incomingClipCircle!.radius).toBeCloseTo(
            coveringRadius(W, H) * 0.5,
            6,
        );
    });

    it('falls back to a crossfade for an unknown type', () => {
        const plan = transitionPlan('nope' as TransitionType, 0.3, W, H);

        expect(plan.incomingAlpha).toBeCloseTo(0.3, 6);
        expect(plan.incomingCoverage).toBe(1);
    });
});

describe('dissolve noise', () => {
    beforeEach(() => {
        releaseDissolveNoise();
    });

    it('is deterministic for the same size and seed', () => {
        const first = Array.from(dissolveNoise(64, 64));
        releaseDissolveNoise();
        const second = Array.from(dissolveNoise(64, 64));

        expect(first).toEqual(second);
    });

    it('returns the cached array for repeated requests', () => {
        expect(dissolveNoise(32, 32)).toBe(dissolveNoise(32, 32));
    });

    it('differs between seeds', () => {
        const a = Array.from(dissolveNoise(32, 32, 1));
        const b = Array.from(dissolveNoise(32, 32, 2));

        expect(a).not.toEqual(b);
    });

    it('spreads values over the whole byte range', () => {
        const values = dissolveNoise(128, 128, 99);

        expect(Math.min(...values)).toBeLessThan(8);
        expect(Math.max(...values)).toBeGreaterThan(247);
    });

    it('thresholds to nothing at 0 and to everything at 1', () => {
        const noise = dissolveNoise(32, 32, 7);
        const mask = new Uint8ClampedArray(noise.length * 4);

        writeDissolveMask(mask, noise, 0);
        expect(
            Array.from(mask)
                .filter((_, i) => i % 4 === 3)
                .some((a) => a > 0),
        ).toBe(false);

        writeDissolveMask(mask, noise, 1);
        expect(
            Array.from(mask)
                .filter((_, i) => i % 4 === 3)
                .every((a) => a === 255),
        ).toBe(true);
    });

    it('produces the identical mask twice for the same threshold', () => {
        const noise = dissolveNoise(48, 48, 5);
        const a = new Uint8ClampedArray(noise.length * 4);
        const b = new Uint8ClampedArray(noise.length * 4);

        writeDissolveMask(a, noise, 0.37);
        writeDissolveMask(b, noise, 0.37);

        expect(Array.from(a)).toEqual(Array.from(b));
    });

    it('reveals more pixels as the threshold grows', () => {
        const noise = dissolveNoise(64, 64, 11);
        const count = (threshold: number) => {
            const mask = new Uint8ClampedArray(noise.length * 4);
            writeDissolveMask(mask, noise, threshold);

            return Array.from(mask).filter(
                (value, i) => i % 4 === 3 && value > 0,
            ).length;
        };

        expect(count(0.25)).toBeLessThan(count(0.75));
    });
});

describe('drawTransition', () => {
    it('draws the outgoing frame then the incoming one, balanced', () => {
        const ctx = createFakeContext();

        drawTransition(
            ctx,
            transitionPlan('fade', 0.5, W, H),
            fakeImage(W, H),
            fakeImage(W, H),
            W,
            H,
        );

        expect(ctx.calls('drawImage')).toHaveLength(2);
        expect(saveBalance(ctx.log)).toEqual({ net: 0, min: 0 });
    });

    it('skips the incoming draw entirely at progress 0', () => {
        const ctx = createFakeContext();

        drawTransition(
            ctx,
            transitionPlan('wipeleft', 0, W, H),
            fakeImage(W, H),
            fakeImage(W, H),
            W,
            H,
        );

        expect(ctx.calls('drawImage')).toHaveLength(1);
    });

    it('clips before drawing the incoming frame for a wipe', () => {
        const ctx = createFakeContext();

        drawTransition(
            ctx,
            transitionPlan('wiperight', 0.5, W, H),
            fakeImage(W, H),
            fakeImage(W, H),
            W,
            H,
        );

        const names = ctx.names();
        expect(names.indexOf('clip')).toBeLessThan(
            names.lastIndexOf('drawImage'),
        );
        expect(ctx.calls('rect')[0].args).toEqual([0, 0, W / 2, H]);
    });

    it('uses an even-odd clip for circleclose', () => {
        const ctx = createFakeContext();

        drawTransition(
            ctx,
            transitionPlan('circleclose', 0.5, W, H),
            fakeImage(W, H),
            fakeImage(W, H),
            W,
            H,
        );

        expect(ctx.calls('clip')[0].args).toEqual(['evenodd']);
        expect(ctx.calls('ellipse')).toHaveLength(1);
    });

    it('paints the veil over both frames for fadeblack', () => {
        const ctx = createFakeContext();

        drawTransition(
            ctx,
            transitionPlan('fadeblack', 0.75, W, H),
            fakeImage(W, H),
            fakeImage(W, H),
            W,
            H,
        );

        const names = ctx.names();
        expect(names.lastIndexOf('fillRect')).toBeGreaterThan(
            names.lastIndexOf('drawImage'),
        );
        expect(ctx.sets('fillStyle')).toContain('#000000');
        expect(saveBalance(ctx.log)).toEqual({ net: 0, min: 0 });
    });

    it('stays balanced for every type at several progress points', () => {
        for (const type of ALL_TYPES) {
            for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
                const ctx = createFakeContext();
                drawTransition(
                    ctx,
                    transitionPlan(type, progress, W, H),
                    fakeImage(W, H),
                    fakeImage(W, H),
                    W,
                    H,
                );
                expect(saveBalance(ctx.log)).toEqual({ net: 0, min: 0 });
            }
        }
    });
});
