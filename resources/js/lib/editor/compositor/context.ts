import { clampCornerRadius } from './geometry';
import type { Rect } from './geometry';

/**
 * The context surface the compositor paints through.
 *
 * Both alternatives are accepted so that the same painter runs inside
 * `requestAnimationFrame` against a visible canvas and inside a worker against
 * an `OffscreenCanvas` during export.
 */
export type Canvas2D =
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D;

/** A context that may expose the (widely but not universally shipped) tracking. */
type ContextWithLetterSpacing = Canvas2D & { letterSpacing?: string };

/**
 * Trace a rectangle, rounded when the radius asks for it.
 *
 * `roundRect` is feature-detected rather than assumed: the fallback keeps the
 * compositor working on older engines, and a zero radius takes the plain `rect`
 * path so the common case stays as cheap as possible.
 */
export function traceRoundedRect(
    ctx: Canvas2D,
    rect: Rect,
    radius: number,
): void {
    const r = clampCornerRadius(radius, rect.width, rect.height);

    ctx.beginPath();

    if (r <= 0) {
        ctx.rect(rect.x, rect.y, rect.width, rect.height);

        return;
    }

    if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(rect.x, rect.y, rect.width, rect.height, r);

        return;
    }

    const { x, y, width, height } = rect;
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.arcTo(x + width, y, x + width, y + r, r);
    ctx.lineTo(x + width, y + height - r);
    ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
    ctx.lineTo(x + r, y + height);
    ctx.arcTo(x, y + height, x, y + height - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}

/**
 * Apply letter spacing natively when the engine supports it.
 *
 * Returns true when the context now tracks by itself, in which case
 * `measureText` already accounts for it and the caller must NOT also space
 * glyphs by hand — measuring and drawing have to agree or the text wraps at one
 * width and paints at another.
 */
export function applyLetterSpacing(
    ctx: Canvas2D,
    letterSpacing: number,
): boolean {
    const target = ctx as ContextWithLetterSpacing;

    if (typeof target.letterSpacing !== 'string') {
        return false;
    }

    target.letterSpacing = `${Number.isFinite(letterSpacing) ? letterSpacing : 0}px`;

    return true;
}

/**
 * Intrinsic pixel size of anything drawable, or null when it cannot be read.
 *
 * Each `CanvasImageSource` variant reports its size under a different pair of
 * properties, and a video with no decoded frame yet reports 0 — which must be
 * treated as "no source" rather than divided by.
 */
export function intrinsicSize(
    source: CanvasImageSource,
): { width: number; height: number } | null {
    const candidate = source as unknown as Record<string, unknown>;

    const width =
        (candidate.naturalWidth as number) ??
        (candidate.videoWidth as number) ??
        (candidate.displayWidth as number) ??
        (candidate.width as number);
    const height =
        (candidate.naturalHeight as number) ??
        (candidate.videoHeight as number) ??
        (candidate.displayHeight as number) ??
        (candidate.height as number);

    if (
        typeof width !== 'number' ||
        typeof height !== 'number' ||
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width <= 0 ||
        height <= 0
    ) {
        return null;
    }

    return { width, height };
}
