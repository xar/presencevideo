import type {
    CompositedFrame,
    ResolvedElement,
    ResolvedFrame,
    ResolvedMediaElement,
    ResolvedShapeElement,
    ResolvedTextElement,
} from '../model/frame';
import { cssFontShorthand, layoutText } from '../model/text-layout';
import { applyEqToRgba, isNeutralAdjustments } from './color-eq';
import { applyLetterSpacing, intrinsicSize, traceRoundedRect } from './context';
import type { Canvas2D } from './context';
import {
    clamp01,
    computeFitRects,
    insetRect,
    isPaintableSize,
    outwardStrokeWidth,
} from './geometry';
import type { Rect } from './geometry';
import { getScratch } from './scratch';
import { drawSubtitles } from './subtitles';
import { drawTransition, transitionPlan } from './transitions';

/**
 * The single canvas compositor.
 *
 * One painter drives both the live preview and the export. Before this there
 * were three renderers — a DOM preview, a client-side canvas export and a
 * server-side ffmpeg filter graph — which disagreed about fit, colour, text
 * wrapping, z-order, transitions and antialiasing. The only way those stay in
 * agreement is for there to be one of them, taking a fully resolved frame and
 * turning it into canvas calls with no further interpretation.
 */

/**
 * Synchronous access to decoded media.
 *
 * SYNCHRONOUS BY CONTRACT: the preview calls the compositor inside
 * `requestAnimationFrame`, where awaiting anything means a dropped frame. The
 * decode layer is expected to prefetch and cache, and to return null on a miss;
 * the compositor simply skips what it cannot draw this frame.
 */
export interface MediaLookup {
    /** Decoded still for an image asset, or null while it is unavailable. */
    getImage(url: string): CanvasImageSource | null;
    /**
     * Decoded video frame at `timeSec` in SOURCE time.
     *
     * `timeSec` is null when the element has run past its source content: the
     * provider must return the LAST decoded frame, matching the render's
     * `tpad=stop=-1:stop_mode=clone`, rather than nothing.
     */
    getVideoFrame(
        url: string,
        timeSec: number | null,
    ): CanvasImageSource | null;
}

/** Border colour used when a border width is set without a colour. */
const DEFAULT_BORDER_COLOR = '#000000';

/** Thickness of a `line` shape when its box has no meaningful height. */
const MIN_LINE_THICKNESS = 1;

/* ------------------------------------------------------------------ */
/* media                                                               */
/* ------------------------------------------------------------------ */

/**
 * Paint a decoded frame through the colour adjustments.
 *
 * The `eq` maths needs pixel access, so the image is drawn to a scratch canvas
 * at its destination size and transformed there. Neutral adjustments never
 * reach this function: the caller draws straight to the target instead, because
 * this path costs a `getImageData`/`putImageData` round trip and the common
 * element has no adjustments at all.
 */
function drawAdjustedImage(
    ctx: Canvas2D,
    source: CanvasImageSource,
    sourceRect: Rect,
    destRect: Rect,
    element: ResolvedMediaElement,
): void {
    const scratch = getScratch('adjust', destRect.width, destRect.height);
    if (!scratch) {
        // No offscreen surface (jsdom, exotic engines): the unadjusted picture
        // is a far better failure than a hole in the composition.
        ctx.drawImage(
            source,
            sourceRect.x,
            sourceRect.y,
            sourceRect.width,
            sourceRect.height,
            destRect.x,
            destRect.y,
            destRect.width,
            destRect.height,
        );

        return;
    }

    scratch.ctx.drawImage(
        source,
        sourceRect.x,
        sourceRect.y,
        sourceRect.width,
        sourceRect.height,
        0,
        0,
        scratch.width,
        scratch.height,
    );

    const pixels = scratch.ctx.getImageData(
        0,
        0,
        scratch.width,
        scratch.height,
    );
    applyEqToRgba(pixels.data, element.adjustments);
    scratch.ctx.putImageData(pixels, 0, 0);

    ctx.drawImage(
        scratch.canvas,
        0,
        0,
        scratch.width,
        scratch.height,
        destRect.x,
        destRect.y,
        destRect.width,
        destRect.height,
    );
}

function drawMediaElement(
    ctx: Canvas2D,
    element: ResolvedMediaElement,
    media: MediaLookup,
): void {
    if (!element.url) {
        return;
    }

    const source =
        element.kind === 'image'
            ? media.getImage(element.url)
            : media.getVideoFrame(element.url, element.sourceTimeSec);

    if (!source) {
        // A cache miss is a transient state, not an error: the next frame will
        // have it. Painting nothing beats painting a placeholder that would
        // also end up in an export.
        return;
    }

    const size = intrinsicSize(source);
    if (!size) {
        return;
    }

    const rects = computeFitRects(
        size.width,
        size.height,
        element.width,
        element.height,
        element.fit,
    );
    if (!rects) {
        return;
    }

    if (isNeutralAdjustments(element.adjustments)) {
        ctx.drawImage(
            source,
            rects.source.x,
            rects.source.y,
            rects.source.width,
            rects.source.height,
            rects.dest.x,
            rects.dest.y,
            rects.dest.width,
            rects.dest.height,
        );

        return;
    }

    drawAdjustedImage(ctx, source, rects.source, rects.dest, element);
}

/* ------------------------------------------------------------------ */
/* text                                                                */
/* ------------------------------------------------------------------ */

/**
 * Draw one line, spacing glyphs by hand.
 *
 * Only used where `ctx.letterSpacing` is unsupported. Measurement uses the same
 * per-character advance plus tracking, so the width the layout wrapped at is
 * the width that is actually painted.
 */
function drawSpacedLine(
    ctx: Canvas2D,
    text: string,
    x: number,
    y: number,
    letterSpacing: number,
    stroke: boolean,
): void {
    let cursor = x;

    for (const character of text) {
        if (stroke) {
            ctx.strokeText(character, cursor, y);
        } else {
            ctx.fillText(character, cursor, y);
        }
        cursor += ctx.measureText(character).width + letterSpacing;
    }
}

function drawTextElement(ctx: Canvas2D, element: ResolvedTextElement): void {
    const box: Rect = {
        x: 0,
        y: 0,
        width: element.width,
        height: element.height,
    };

    // The background is the FULL element rect, rounded. `drawtext box=1` drew a
    // tight box around the glyphs instead, so a centred caption's background
    // jumped around as the text changed. The rect the user sized is the rect
    // that paints.
    if (element.backgroundColor) {
        ctx.fillStyle = element.backgroundColor;
        traceRoundedRect(ctx, box, element.backgroundRadius);
        ctx.fill();
    }

    if ((element.text ?? '') === '') {
        return;
    }

    const fontSize = element.fontSize;
    if (!Number.isFinite(fontSize) || fontSize <= 0) {
        return;
    }

    ctx.save();
    try {
        // Clip to the element box so overflowing text is cut at its own edges
        // rather than spilling across the composition.
        traceRoundedRect(ctx, box, element.backgroundRadius);
        ctx.clip();

        ctx.font = cssFontShorthand(element);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        const letterSpacing = Number.isFinite(element.letterSpacing)
            ? element.letterSpacing
            : 0;
        const nativeSpacing = applyLetterSpacing(ctx, letterSpacing);
        const measure = (text: string): number => {
            const width = ctx.measureText(text).width;

            return nativeSpacing ? width : width + letterSpacing * text.length;
        };

        const layout = layoutText(
            {
                text: element.text,
                width: element.width,
                height: element.height,
                fontSize,
                fontFamily: element.fontFamily,
                fontWeight: element.fontWeight,
                padding: element.padding,
                align: element.align,
                verticalAlign: element.verticalAlign,
                lineHeight: element.lineHeight,
                letterSpacing,
                wrap: true,
            },
            measure,
        );

        const strokeWidth = outwardStrokeWidth(element.strokeWidth);
        const hasStroke = Boolean(element.strokeColor) && strokeWidth > 0;

        if (hasStroke) {
            ctx.lineWidth = strokeWidth;
            ctx.lineJoin = 'round';
            ctx.miterLimit = 2;
            ctx.strokeStyle = element.strokeColor as string;
        }
        ctx.fillStyle = element.color;

        for (const line of layout.lines) {
            const y = line.y + layout.lineHeightPx / 2;

            if (hasStroke) {
                // Canvas centres a stroke on the glyph outline, so the width is
                // doubled and the stroke painted UNDER the fill: the inner half
                // is covered and exactly the intended outward width shows.
                if (nativeSpacing) {
                    ctx.strokeText(line.text, line.x, y);
                } else {
                    drawSpacedLine(
                        ctx,
                        line.text,
                        line.x,
                        y,
                        letterSpacing,
                        true,
                    );
                }
            }

            if (nativeSpacing) {
                ctx.fillText(line.text, line.x, y);
            } else {
                drawSpacedLine(ctx, line.text, line.x, y, letterSpacing, false);
            }
        }
    } finally {
        ctx.restore();
    }
}

/* ------------------------------------------------------------------ */
/* shapes                                                              */
/* ------------------------------------------------------------------ */

/**
 * Trace a shape's outline into the current path.
 *
 * Native Canvas2D paths are used deliberately. The server render thresholded a
 * signed distance field with `geq`, producing 1-bit alpha: stair-stepped
 * ellipses and rounded corners that were the most obvious "the export looks
 * worse than the preview" artifact. Path filling is antialiased for free.
 */
function traceShape(
    ctx: Canvas2D,
    element: ResolvedShapeElement,
    rect: Rect,
): void {
    if (element.shape === 'ellipse') {
        ctx.beginPath();
        ctx.ellipse(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2,
            rect.width / 2,
            rect.height / 2,
            0,
            0,
            Math.PI * 2,
        );

        return;
    }

    if (element.shape === 'line') {
        // A line is a thin bar, with no arrow heads — the same geometry as a
        // rectangle, so it inherits the same antialiased edges.
        const thickness = Math.max(MIN_LINE_THICKNESS, rect.height);
        ctx.beginPath();
        ctx.rect(
            rect.x,
            rect.y + (rect.height - thickness) / 2,
            rect.width,
            thickness,
        );

        return;
    }

    traceRoundedRect(ctx, rect, element.cornerRadius);
}

function drawShapeElement(ctx: Canvas2D, element: ResolvedShapeElement): void {
    const borderWidth =
        Number.isFinite(element.borderWidth) && element.borderWidth > 0
            ? element.borderWidth
            : 0;
    // A width without a colour means a black border, which is what the preview
    // did; the render treated it as no border at all.
    const borderColor =
        borderWidth > 0 ? (element.borderColor ?? DEFAULT_BORDER_COLOR) : null;

    if (!element.fillColor && !borderColor) {
        return;
    }

    const box: Rect = {
        x: 0,
        y: 0,
        width: element.width,
        height: element.height,
    };

    if (element.fillColor) {
        ctx.fillStyle = element.fillColor;
        traceShape(ctx, element, box);
        ctx.fill();
    }

    if (!borderColor) {
        return;
    }

    // Borders are inset (`box-sizing: border-box`): the stroke is centred on
    // the path, so the path moves in by half the width to keep the stroke
    // entirely inside the element's own box.
    const strokeRect = insetRect(box, borderWidth / 2);
    if (!strokeRect) {
        return;
    }

    ctx.lineWidth = borderWidth;
    ctx.strokeStyle = borderColor;
    traceShape(ctx, element, strokeRect);
    ctx.stroke();
}

/* ------------------------------------------------------------------ */
/* frames                                                              */
/* ------------------------------------------------------------------ */

/** Paint a single element, with its own rotation, opacity and local origin. */
export function drawElement(
    ctx: Canvas2D,
    element: ResolvedElement,
    media: MediaLookup,
): void {
    const opacity = clamp01(element.opacity);
    if (opacity <= 0) {
        return;
    }

    if (
        !Number.isFinite(element.x) ||
        !Number.isFinite(element.y) ||
        !isPaintableSize(element.width, element.height)
    ) {
        return;
    }

    ctx.save();
    try {
        // The group alpha is applied ONCE, to the element as a whole, so a
        // faded text element fades its box, stroke and glyphs together. The old
        // render faded only the glyphs.
        ctx.globalAlpha = ctx.globalAlpha * opacity;

        const centreX = element.x + element.width / 2;
        const centreY = element.y + element.height / 2;
        const rotation = Number.isFinite(element.rotation)
            ? element.rotation
            : 0;

        // Rotation is about the element's own centre and does NOT change the
        // layout box: content simply overflows and is clipped by the canvas.
        ctx.translate(centreX, centreY);
        if (rotation !== 0) {
            ctx.rotate((rotation * Math.PI) / 180);
        }
        ctx.translate(-element.width / 2, -element.height / 2);

        switch (element.kind) {
            case 'text':
                drawTextElement(ctx, element);
                break;
            case 'shape':
                drawShapeElement(ctx, element);
                break;
            default:
                drawMediaElement(ctx, element, media);
                break;
        }
    } finally {
        ctx.restore();
    }
}

/** Elements in paint order: ascending `zIndex`, ties kept in resolve order. */
export function sortedElements(frame: ResolvedFrame): ResolvedElement[] {
    return frame.elements
        .map((element, index) => ({ element, index }))
        .sort(
            (a, b) => a.element.zIndex - b.element.zIndex || a.index - b.index,
        )
        .map((entry) => entry.element);
}

/**
 * Paint one resolved frame: background, then elements by z-order, then
 * subtitles, which are always topmost.
 */
export function drawResolvedFrame(
    ctx: Canvas2D,
    frame: ResolvedFrame,
    media: MediaLookup,
): void {
    ctx.save();
    try {
        ctx.clearRect(0, 0, frame.width, frame.height);

        if (frame.backgroundColor) {
            ctx.fillStyle = frame.backgroundColor;
            ctx.fillRect(0, 0, frame.width, frame.height);
        }

        for (const element of sortedElements(frame)) {
            drawElement(ctx, element, media);
        }

        drawSubtitles(ctx, frame.subtitles ?? [], frame.width, frame.height);
    } finally {
        ctx.restore();
    }
}

/**
 * Paint a composited frame — the compositor's entry point.
 *
 * Synchronous from end to end so the preview can call it inside
 * `requestAnimationFrame` and the exporter can call it in a tight loop.
 */
export function drawFrame(
    ctx: Canvas2D,
    frame: CompositedFrame,
    media: MediaLookup,
): void {
    const primary = frame.primary;

    if (!frame.transition) {
        drawResolvedFrame(ctx, primary, media);

        return;
    }

    const { type, progress, incoming } = frame.transition;
    const width = primary.width;
    const height = primary.height;

    const outgoingScratch = getScratch('transition-a', width, height);
    const incomingScratch = getScratch('transition-b', width, height);

    if (!outgoingScratch || !incomingScratch) {
        // Without scratch surfaces the honest fallback is the frame that is
        // mostly on screen, rather than nothing at all.
        drawResolvedFrame(ctx, progress < 0.5 ? primary : incoming, media);

        return;
    }

    drawResolvedFrame(outgoingScratch.ctx, primary, media);
    drawResolvedFrame(incomingScratch.ctx, incoming, media);

    const plan = transitionPlan(type, progress, width, height);

    ctx.save();
    try {
        ctx.clearRect(0, 0, width, height);
        drawTransition(
            ctx,
            plan,
            outgoingScratch.canvas,
            incomingScratch.canvas,
            width,
            height,
        );
    } finally {
        ctx.restore();
    }
}
