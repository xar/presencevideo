/**
 * Easing curves for keyframe interpolation.
 *
 * Every named curve is a cubic bezier with the same control points CSS uses, so
 * a motion preset authored against the compositor and the same motion written
 * as a CSS transition land on identical values. `hold` is the exception: it is
 * a step function that keeps the outgoing keyframe's value until the next one,
 * which is how "no interpolation" is expressed on a property track.
 */
export type NamedEasing =
    | 'linear'
    | 'ease'
    | 'ease-in'
    | 'ease-out'
    | 'ease-in-out'
    | 'hold';

/** Control points `[x1, y1, x2, y2]`, matching `cubic-bezier()` in CSS. */
export type CubicBezierEasing = readonly [number, number, number, number];

export type Easing = NamedEasing | CubicBezierEasing;

const NAMED_CURVES: Record<
    Exclude<NamedEasing, 'linear' | 'hold'>,
    CubicBezierEasing
> = {
    ease: [0.25, 0.1, 0.25, 1],
    'ease-in': [0.42, 0, 1, 1],
    'ease-out': [0, 0, 0.58, 1],
    'ease-in-out': [0.42, 0, 0.58, 1],
};

function bezierComponent(t: number, a1: number, a2: number): number {
    // Bernstein form of a cubic bezier whose first and last points are 0 and 1.
    const c = 3 * a1;
    const b = 3 * (a2 - a1) - c;
    const a = 1 - c - b;
    return ((a * t + b) * t + c) * t;
}

function bezierSlope(t: number, a1: number, a2: number): number {
    const c = 3 * a1;
    const b = 3 * (a2 - a1) - c;
    const a = 1 - c - b;
    return (3 * a * t + 2 * b) * t + c;
}

/**
 * Solve `x(t) = x` for the bezier's parametric t, then evaluate y at it.
 *
 * Newton-Raphson converges in a couple of iterations for the well-behaved
 * curves we ship; the bisection fallback covers control points with a near-zero
 * slope, where Newton would stall or diverge.
 */
function solveBezier(x: number, [x1, y1, x2, y2]: CubicBezierEasing): number {
    if (x1 === y1 && x2 === y2) {
        return x;
    }

    let t = x;
    for (let i = 0; i < 8; i++) {
        const error = bezierComponent(t, x1, x2) - x;
        if (Math.abs(error) < 1e-6) {
            return bezierComponent(t, y1, y2);
        }

        const slope = bezierSlope(t, x1, x2);
        if (Math.abs(slope) < 1e-6) {
            break;
        }

        t -= error / slope;
    }

    let low = 0;
    let high = 1;
    t = x;
    for (let i = 0; i < 20; i++) {
        const value = bezierComponent(t, x1, x2);
        if (Math.abs(value - x) < 1e-6) {
            break;
        }

        if (value < x) {
            low = t;
        } else {
            high = t;
        }
        t = (low + high) / 2;
    }

    return bezierComponent(t, y1, y2);
}

function isCubicBezier(easing: Easing): easing is CubicBezierEasing {
    return Array.isArray(easing);
}

/**
 * Map a normalized progress 0..1 through an easing curve.
 *
 * Progress outside 0..1 is clamped: keyframe segments never extrapolate, so a
 * property holds its endpoint value beyond the segment rather than overshooting
 * into a value the user never authored.
 */
export function applyEasing(
    progress: number,
    easing: Easing = 'linear',
): number {
    const t = progress <= 0 ? 0 : progress >= 1 ? 1 : progress;

    if (easing === 'hold') {
        return t >= 1 ? 1 : 0;
    }

    if (easing === 'linear') {
        return t;
    }

    if (isCubicBezier(easing)) {
        return solveBezier(t, easing);
    }

    const curve = NAMED_CURVES[easing];
    return curve ? solveBezier(t, curve) : t;
}

/** Named curves offered in the inspector, in the order they should be listed. */
export const EASING_OPTIONS: readonly NamedEasing[] = [
    'linear',
    'ease',
    'ease-in',
    'ease-out',
    'ease-in-out',
    'hold',
] as const;
