import type { MediaFit } from '../model/frame';

/**
 * Pure geometry for the compositor.
 *
 * Everything here is deliberately canvas-free: the fit maths, the guards and
 * the stroke compensation are the parts most likely to diverge between the
 * preview and the export, so they are plain numbers that can be asserted
 * directly in tests instead of being inferred from painted pixels.
 */

export type Rect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

/** A `drawImage` call expressed as its two rectangles. */
export type DrawRects = {
    /** Sub-rectangle of the SOURCE image to sample. */
    source: Rect;
    /** Destination rectangle, in the element's own local coordinates. */
    dest: Rect;
};

/** True when every number is finite — the cheapest NaN guard in the hot path. */
export function isFiniteRect(rect: Rect): boolean {
    return (
        Number.isFinite(rect.x) &&
        Number.isFinite(rect.y) &&
        Number.isFinite(rect.width) &&
        Number.isFinite(rect.height)
    );
}

/** True when the box has real, positive, finite extents worth painting into. */
export function isPaintableSize(width: number, height: number): boolean {
    return (
        Number.isFinite(width) &&
        Number.isFinite(height) &&
        width > 0 &&
        height > 0
    );
}

/**
 * Resolve a media fit into the source and destination rectangles of one
 * `drawImage` call.
 *
 * The three modes are the confirmed divergence between the surfaces: the old
 * DOM preview used `object-fit: cover` while both export paths used ffmpeg's
 * `scale` without `force_original_aspect_ratio`, i.e. a stretch. Rather than
 * pick a winner, the fit is now an explicit field and all three are honoured,
 * always centre-aligned.
 *
 * Returns null for degenerate input (zero, negative or non-finite extents) so
 * callers can skip the draw rather than hand NaN to the canvas.
 */
export function computeFitRects(
    sourceWidth: number,
    sourceHeight: number,
    boxWidth: number,
    boxHeight: number,
    fit: MediaFit,
): DrawRects | null {
    if (
        !isPaintableSize(sourceWidth, sourceHeight) ||
        !isPaintableSize(boxWidth, boxHeight)
    ) {
        return null;
    }

    const fullSource: Rect = {
        x: 0,
        y: 0,
        width: sourceWidth,
        height: sourceHeight,
    };
    const fullDest: Rect = { x: 0, y: 0, width: boxWidth, height: boxHeight };

    if (fit === 'fill') {
        return { source: fullSource, dest: fullDest };
    }

    if (fit === 'contain') {
        const scale = Math.min(
            boxWidth / sourceWidth,
            boxHeight / sourceHeight,
        );
        const width = sourceWidth * scale;
        const height = sourceHeight * scale;

        return {
            source: fullSource,
            dest: {
                x: (boxWidth - width) / 2,
                y: (boxHeight - height) / 2,
                width,
                height,
            },
        };
    }

    // cover: scale up until both axes are filled, then centre-crop the source.
    const scale = Math.max(boxWidth / sourceWidth, boxHeight / sourceHeight);
    const cropWidth = Math.min(sourceWidth, boxWidth / scale);
    const cropHeight = Math.min(sourceHeight, boxHeight / scale);

    return {
        source: {
            x: (sourceWidth - cropWidth) / 2,
            y: (sourceHeight - cropHeight) / 2,
            width: cropWidth,
            height: cropHeight,
        },
        dest: fullDest,
    };
}

/**
 * Canvas `strokeText`/`stroke` centre the stroke on the outline, so half of it
 * lands inside the glyph and is then hidden by the fill. The editor's stroke
 * width means the visible OUTWARD width, which is what the user sees in the
 * inspector and what `drawtext borderw` produced. Doubling the line width and
 * painting the stroke UNDER the fill leaves exactly the intended outer half
 * showing.
 */
export function outwardStrokeWidth(strokeWidth: number): number {
    if (!Number.isFinite(strokeWidth) || strokeWidth <= 0) {
        return 0;
    }

    return strokeWidth * 2;
}

/**
 * Inset a rectangle by half a border width.
 *
 * Borders are `box-sizing: border-box`: the stroke sits entirely inside the
 * element box, so the path has to be pulled in by half the line width. Returns
 * null once the border is thick enough to swallow the box.
 */
export function insetRect(rect: Rect, inset: number): Rect | null {
    const width = rect.width - inset * 2;
    const height = rect.height - inset * 2;

    if (!isPaintableSize(width, height)) {
        return null;
    }

    return { x: rect.x + inset, y: rect.y + inset, width, height };
}

/** Corner radius that cannot exceed half of either side of the box. */
export function clampCornerRadius(
    radius: number,
    width: number,
    height: number,
): number {
    if (!Number.isFinite(radius) || radius <= 0) {
        return 0;
    }

    return Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
}

/** Clamp to 0..1, mapping NaN to 0 rather than poisoning `globalAlpha`. */
export function clamp01(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }

    return value < 0 ? 0 : value > 1 ? 1 : value;
}
