import type { ResolvedAdjustments } from '../model/frame';

/**
 * ffmpeg `eq` colour adjustments, reimplemented for RGBA pixels.
 *
 * WHY not CSS filters: the old DOM preview used `filter: brightness(b)`, which
 * is MULTIPLICATIVE, while the stored value is ffmpeg's ADDITIVE luma offset on
 * a -1..1 scale. The two only agree at the neutral value, so every non-zero
 * brightness looked different in the preview than in the export. The stored
 * numbers must keep meaning what the render made them mean, so the render's
 * maths is what moves — into the canvas.
 *
 * `eq` builds its LUTs in YUV (vf_eq.c):
 *   luma:   out = (in - 128) * contrast + 128 + 255 * brightness
 *   chroma: out = (in - 128) * saturation + 128
 * so the transform here is RGB -> YUV (BT.601) -> adjust -> RGB.
 */

export const NEUTRAL_ADJUSTMENTS: ResolvedAdjustments = {
    brightness: 0,
    contrast: 1,
    saturation: 1,
};

/**
 * True when the adjustment would be a no-op.
 *
 * This is the hot-path early-out: an unadjusted element must never pay for an
 * offscreen canvas, a `getImageData` round trip or a per-pixel loop.
 */
export function isNeutralAdjustments(
    adjustments: ResolvedAdjustments | null | undefined,
): boolean {
    if (!adjustments) {
        return true;
    }

    const { brightness, contrast, saturation } = adjustments;

    return (
        (!Number.isFinite(brightness) || brightness === 0) &&
        (!Number.isFinite(contrast) || contrast === 1) &&
        (!Number.isFinite(saturation) || saturation === 1)
    );
}

function clampByte(value: number): number {
    if (!(value > 0)) {
        return 0;
    }

    return value > 255 ? 255 : value;
}

/** One adjustment coefficient set, sanitised once instead of per pixel. */
type EqCoefficients = {
    brightness: number;
    contrast: number;
    saturation: number;
};

function sanitise(adjustments: ResolvedAdjustments): EqCoefficients {
    return {
        brightness: Number.isFinite(adjustments.brightness)
            ? adjustments.brightness
            : 0,
        contrast: Number.isFinite(adjustments.contrast)
            ? adjustments.contrast
            : 1,
        saturation: Number.isFinite(adjustments.saturation)
            ? adjustments.saturation
            : 1,
    };
}

/**
 * Apply `eq` to a single RGB triplet, returning integer channel values.
 *
 * Neutral adjustments short-circuit to the input untouched: the YUV round trip
 * is mathematically the identity but not bit-exact in floating point, and a
 * neutral element must be pixel-identical to its source.
 */
export function eqPixel(
    r: number,
    g: number,
    b: number,
    adjustments: ResolvedAdjustments,
): [number, number, number] {
    if (isNeutralAdjustments(adjustments)) {
        return [r, g, b];
    }

    const { brightness, contrast, saturation } = sanitise(adjustments);

    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const u = -0.168736 * r - 0.331264 * g + 0.5 * b + 128;
    const v = 0.5 * r - 0.418688 * g - 0.081312 * b + 128;

    const y2 = (y - 128) * contrast + 128 + 255 * brightness;
    const u2 = (u - 128) * saturation;
    const v2 = (v - 128) * saturation;

    return [
        clampByte(Math.round(y2 + 1.402 * v2)),
        clampByte(Math.round(y2 - 0.344136 * u2 - 0.714136 * v2)),
        clampByte(Math.round(y2 + 1.772 * u2)),
    ];
}

/**
 * Apply `eq` in place to an RGBA byte buffer (an `ImageData.data`).
 *
 * Written as a flat loop over a typed array with the coefficients hoisted: this
 * runs once per adjusted element per frame, up to 60 times a second.
 */
export function applyEqToRgba(
    data: Uint8ClampedArray,
    adjustments: ResolvedAdjustments,
): void {
    if (isNeutralAdjustments(adjustments)) {
        return;
    }

    const { brightness, contrast, saturation } = sanitise(adjustments);
    const lumaOffset = 128 + 255 * brightness;

    for (let i = 0; i < data.length; i += 4) {
        // Fully transparent pixels cannot show a colour change; skipping them
        // keeps letterboxed and rounded content cheap.
        if (data[i + 3] === 0) {
            continue;
        }

        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        const y =
            (0.299 * r + 0.587 * g + 0.114 * b - 128) * contrast + lumaOffset;
        const u = (-0.168736 * r - 0.331264 * g + 0.5 * b) * saturation;
        const v = (0.5 * r - 0.418688 * g - 0.081312 * b) * saturation;

        // Uint8ClampedArray clamps and rounds on assignment, so no extra work.
        data[i] = y + 1.402 * v;
        data[i + 1] = y - 0.344136 * u - 0.714136 * v;
        data[i + 2] = y + 1.772 * u;
    }
}
