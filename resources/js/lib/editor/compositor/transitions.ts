import type { TransitionType } from '@/types/editor';
import type { Canvas2D } from './context';
import { clamp01 } from './geometry';
import type { Rect } from './geometry';
import { getScratch } from './scratch';

/**
 * Scene transitions, painted by the compositor instead of by ffmpeg `xfade`.
 *
 * Every `TransitionType` is an xfade name, so the look here has to match what
 * xfade actually does rather than what the old DOM preview approximated. The
 * biggest correction: `fade` is a real CROSSFADE into the next scene. The
 * preview used to fade the outgoing scene to BLACK and back, which is
 * `fadeblack` — a different transition that also exists in the list, so the two
 * were indistinguishable on screen and obviously different in the export.
 *
 * The geometry is separated from the painting: `transitionPlan()` is pure and
 * fully testable, `drawTransition()` only turns a plan into canvas calls.
 */

/** A circular reveal mask, in frame pixels. */
export type CircleMask = {
    cx: number;
    cy: number;
    radius: number;
    /**
     * When true the incoming frame shows OUTSIDE the circle (`circleclose`),
     * drawn with an even-odd path rather than a second pass.
     */
    inverted: boolean;
};

export type TransitionPlan = {
    type: TransitionType;
    progress: number;
    /** Alpha the outgoing frame is drawn at. */
    outgoingAlpha: number;
    /** Alpha the incoming frame is drawn at. */
    incomingAlpha: number;
    /** Translation applied to the outgoing frame, in frame pixels. */
    outgoingOffset: { x: number; y: number };
    /** Translation applied to the incoming frame, in frame pixels. */
    incomingOffset: { x: number; y: number };
    /** Hard-edged reveal rectangle for the incoming frame, or null. */
    incomingClipRect: Rect | null;
    /** Circular reveal for the incoming frame, or null. */
    incomingClipCircle: CircleMask | null;
    /** Per-pixel noise threshold in 0..1 for `dissolve`, or null. */
    dissolveThreshold: number | null;
    /** Solid colour veil painted over both frames (`fadeblack`/`fadewhite`). */
    veilColor: string | null;
    veilAlpha: number;
    /**
     * Fraction of the canvas the incoming frame occupies, 0..1.
     *
     * Normalised rather than exact for the circular masks; it exists so the
     * invariant "progress 0 shows only the outgoing frame, progress 1 only the
     * incoming one" can be asserted on numbers for every type.
     */
    incomingCoverage: number;
};

function emptyPlan(type: TransitionType, progress: number): TransitionPlan {
    return {
        type,
        progress,
        outgoingAlpha: 1,
        incomingAlpha: 0,
        outgoingOffset: { x: 0, y: 0 },
        incomingOffset: { x: 0, y: 0 },
        incomingClipRect: null,
        incomingClipCircle: null,
        dissolveThreshold: null,
        veilColor: null,
        veilAlpha: 0,
        incomingCoverage: 0,
    };
}

/** Radius that reaches the far corner of the frame from its centre. */
export function coveringRadius(width: number, height: number): number {
    return Math.hypot(width, height) / 2;
}

/**
 * Resolve a transition into pure geometry.
 *
 * Progress is clamped, so a caller that overshoots gets the end state instead
 * of an extrapolated one.
 */
export function transitionPlan(
    type: TransitionType,
    rawProgress: number,
    width: number,
    height: number,
): TransitionPlan {
    const progress = clamp01(rawProgress);
    const plan = emptyPlan(type, progress);

    switch (type) {
        case 'fade': {
            // A real crossfade: the incoming frame is laid over the outgoing
            // one at increasing alpha, reaching full opacity (and so full
            // coverage) at the end.
            plan.incomingAlpha = progress;
            plan.incomingCoverage = 1;
            break;
        }

        case 'fadeblack':
        case 'fadewhite': {
            // Out through the colour, then in from it. The incoming frame is
            // swapped in at the midpoint, under a veil that is fully opaque
            // exactly there, so the cut is invisible.
            const colour = type === 'fadeblack' ? '#000000' : '#ffffff';
            plan.veilColor = colour;

            if (progress < 0.5) {
                plan.veilAlpha = progress * 2;
                plan.incomingAlpha = 0;
                plan.incomingCoverage = 0;
            } else {
                plan.veilAlpha = (1 - progress) * 2;
                plan.incomingAlpha = 1;
                plan.incomingCoverage = 1;
            }
            break;
        }

        case 'slideleft': {
            plan.outgoingOffset = { x: -width * progress, y: 0 };
            plan.incomingOffset = { x: width * (1 - progress), y: 0 };
            plan.incomingAlpha = 1;
            plan.incomingCoverage = progress;
            break;
        }

        case 'slideright': {
            plan.outgoingOffset = { x: width * progress, y: 0 };
            plan.incomingOffset = { x: -width * (1 - progress), y: 0 };
            plan.incomingAlpha = 1;
            plan.incomingCoverage = progress;
            break;
        }

        case 'slideup': {
            plan.outgoingOffset = { x: 0, y: -height * progress };
            plan.incomingOffset = { x: 0, y: height * (1 - progress) };
            plan.incomingAlpha = 1;
            plan.incomingCoverage = progress;
            break;
        }

        case 'slidedown': {
            plan.outgoingOffset = { x: 0, y: height * progress };
            plan.incomingOffset = { x: 0, y: -height * (1 - progress) };
            plan.incomingAlpha = 1;
            plan.incomingCoverage = progress;
            break;
        }

        case 'wipeleft': {
            // The edge travels leftwards, so the incoming frame is revealed
            // from the right-hand side of the canvas.
            plan.incomingAlpha = 1;
            plan.incomingClipRect = {
                x: width * (1 - progress),
                y: 0,
                width: width * progress,
                height,
            };
            plan.incomingCoverage = progress;
            break;
        }

        case 'wiperight': {
            plan.incomingAlpha = 1;
            plan.incomingClipRect = {
                x: 0,
                y: 0,
                width: width * progress,
                height,
            };
            plan.incomingCoverage = progress;
            break;
        }

        case 'circleopen': {
            plan.incomingAlpha = 1;
            plan.incomingClipCircle = {
                cx: width / 2,
                cy: height / 2,
                radius: coveringRadius(width, height) * progress,
                inverted: false,
            };
            plan.incomingCoverage = progress;
            break;
        }

        case 'circleclose': {
            // The outgoing frame collapses into a shrinking circle, so the
            // incoming frame is what shows everywhere outside it.
            plan.incomingAlpha = 1;
            plan.incomingClipCircle = {
                cx: width / 2,
                cy: height / 2,
                radius: coveringRadius(width, height) * (1 - progress),
                inverted: true,
            };
            plan.incomingCoverage = progress;
            break;
        }

        case 'dissolve': {
            plan.incomingAlpha = 1;
            plan.dissolveThreshold = progress;
            plan.incomingCoverage = progress;
            break;
        }

        default: {
            // Unknown types degrade to a crossfade rather than to nothing.
            plan.incomingAlpha = progress;
            plan.incomingCoverage = 1;
            break;
        }
    }

    // The endpoints are exact for every type, so a transition can never leave a
    // seam of the wrong scene on its first or last frame.
    if (progress >= 1) {
        plan.incomingAlpha = 1;
        plan.incomingCoverage = 1;
        plan.incomingOffset = { x: 0, y: 0 };
        plan.veilAlpha = 0;
    }

    if (progress <= 0) {
        plan.outgoingOffset = { x: 0, y: 0 };
    }

    return plan;
}

/* ------------------------------------------------------------------ */
/* dissolve noise                                                      */
/* ------------------------------------------------------------------ */

/**
 * Deterministic PRNG (mulberry32).
 *
 * Determinism is a hard requirement, not a nicety: the export must be
 * reproducible, and a re-render of the same frame has to produce the same
 * dissolve pattern as the preview showed.
 */
function mulberry32(seed: number): () => number {
    let a = seed >>> 0;

    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export const DISSOLVE_SEED = 0x5eed1234;

/**
 * Per-pixel noise thresholds, 0..255, for a frame of the given size.
 *
 * Generated once per size and cached: the array is the expensive part, while
 * thresholding it is a cheap comparison done per frame.
 */
const noiseCache = new Map<string, Uint8Array>();

export function dissolveNoise(
    width: number,
    height: number,
    seed: number = DISSOLVE_SEED,
): Uint8Array {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    const key = `${w}x${h}:${seed}`;

    const cached = noiseCache.get(key);
    if (cached) {
        return cached;
    }

    const random = mulberry32(seed);
    const values = new Uint8Array(w * h);
    for (let i = 0; i < values.length; i++) {
        values[i] = Math.floor(random() * 256);
    }

    noiseCache.set(key, values);

    return values;
}

/**
 * Write a binary alpha mask into an RGBA buffer: opaque where the incoming
 * frame shows through, transparent where the outgoing frame stays.
 */
export function writeDissolveMask(
    target: Uint8ClampedArray,
    noise: Uint8Array,
    threshold: number,
): void {
    const cut = clamp01(threshold) * 256;

    for (let i = 0; i < noise.length; i++) {
        const alpha = noise[i] < cut ? 255 : 0;
        const o = i * 4;
        target[o] = 255;
        target[o + 1] = 255;
        target[o + 2] = 255;
        target[o + 3] = alpha;
    }
}

/** Clear every cached noise array. Used by tests and on project teardown. */
export function releaseDissolveNoise(): void {
    noiseCache.clear();
}

/* ------------------------------------------------------------------ */
/* painting                                                            */
/* ------------------------------------------------------------------ */

function drawLayer(
    ctx: Canvas2D,
    source: CanvasImageSource,
    width: number,
    height: number,
    offset: { x: number; y: number },
    alpha: number,
): void {
    if (alpha <= 0) {
        return;
    }

    ctx.save();
    try {
        ctx.globalAlpha = alpha;
        ctx.drawImage(source, offset.x, offset.y, width, height);
    } finally {
        ctx.restore();
    }
}

/**
 * Cut the incoming frame down to the dissolve mask on a scratch surface.
 *
 * `destination-in` keeps only the pixels the mask marks opaque, giving the
 * hard per-pixel speckle xfade produces rather than a uniform crossfade.
 */
function drawDissolved(
    ctx: Canvas2D,
    incoming: CanvasImageSource,
    width: number,
    height: number,
    threshold: number,
): void {
    const mask = getScratch('dissolve-mask', width, height);
    const layer = getScratch('dissolve-layer', width, height);
    if (!mask || !layer) {
        // Without scratch surfaces the mask cannot be built; an unmasked
        // incoming frame is a far better fallback than an empty canvas.
        ctx.drawImage(incoming, 0, 0, width, height);

        return;
    }

    const noise = dissolveNoise(mask.width, mask.height);
    const maskData = mask.ctx.createImageData(mask.width, mask.height);
    writeDissolveMask(maskData.data, noise, threshold);
    mask.ctx.putImageData(maskData, 0, 0);

    layer.ctx.save();
    try {
        layer.ctx.drawImage(incoming, 0, 0, layer.width, layer.height);
        // `putImageData` ignores composite operations, so the mask is applied
        // by compositing the canvas that already carries it in its alpha.
        layer.ctx.globalCompositeOperation = 'destination-in';
        layer.ctx.drawImage(mask.canvas, 0, 0);
    } finally {
        layer.ctx.restore();
    }

    ctx.drawImage(layer.canvas, 0, 0, width, height);
}

/**
 * Composite two already-painted frames according to a plan.
 *
 * The frames arrive as image sources (scratch canvases) rather than as
 * `ResolvedFrame`s so this module stays ignorant of scenes and elements.
 */
export function drawTransition(
    ctx: Canvas2D,
    plan: TransitionPlan,
    outgoing: CanvasImageSource,
    incoming: CanvasImageSource,
    width: number,
    height: number,
): void {
    drawLayer(
        ctx,
        outgoing,
        width,
        height,
        plan.outgoingOffset,
        plan.outgoingAlpha,
    );

    if (plan.incomingAlpha > 0 && plan.incomingCoverage > 0) {
        ctx.save();
        try {
            ctx.globalAlpha = plan.incomingAlpha;

            if (plan.incomingClipRect) {
                const clip = plan.incomingClipRect;
                ctx.beginPath();
                ctx.rect(clip.x, clip.y, clip.width, clip.height);
                ctx.clip();
            }

            if (plan.incomingClipCircle) {
                const circle = plan.incomingClipCircle;
                ctx.beginPath();
                if (circle.inverted) {
                    // Rectangle minus circle, via the even-odd fill rule.
                    ctx.rect(0, 0, width, height);
                }
                ctx.ellipse(
                    circle.cx,
                    circle.cy,
                    Math.max(0, circle.radius),
                    Math.max(0, circle.radius),
                    0,
                    0,
                    Math.PI * 2,
                );
                ctx.clip(circle.inverted ? 'evenodd' : 'nonzero');
            }

            if (plan.dissolveThreshold !== null) {
                drawDissolved(
                    ctx,
                    incoming,
                    width,
                    height,
                    plan.dissolveThreshold,
                );
            } else {
                ctx.drawImage(
                    incoming,
                    plan.incomingOffset.x,
                    plan.incomingOffset.y,
                    width,
                    height,
                );
            }
        } finally {
            ctx.restore();
        }
    }

    if (plan.veilColor && plan.veilAlpha > 0) {
        ctx.save();
        try {
            ctx.globalAlpha = clamp01(plan.veilAlpha);
            ctx.fillStyle = plan.veilColor;
            ctx.fillRect(0, 0, width, height);
        } finally {
            ctx.restore();
        }
    }
}
