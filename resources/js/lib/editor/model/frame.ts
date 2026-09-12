import type { ShapeKind, TextAlign, TransitionType } from '@/types/editor';
import type { VerticalAlign } from './text-layout';

/**
 * The contract between "what the project means at time T" and "how to paint it".
 *
 * Resolving a frame is the only place that knows about scenes, tracks, trims,
 * transitions and keyframes; painting a frame is the only place that knows
 * about canvases and pixels. Keeping the seam here is what lets the preview and
 * the export share a renderer: both resolve a frame the same way, then paint it
 * the same way, so they cannot drift.
 *
 * Every geometric value is in PROJECT pixels with the origin at the top-left of
 * the canvas. Display scaling is applied by the painter as a single transform,
 * never baked into these numbers.
 */

/** Where an element came from, which decides nothing about painting but a lot about editing. */
export type ElementOrigin = 'scene' | 'track';

export type ResolvedElementBase = {
    /** Stable identity of the underlying layer or clip. */
    id: string;
    origin: ElementOrigin;
    /** Scene id for scene layers, track id for timeline clips. */
    containerId: string;
    /**
     * Global paint order, lowest first. Scene layers and timeline clips are
     * ordered in ONE sequence: the preview used to force clips above everything
     * while the render used insertion order, and the two disagreed.
     */
    zIndex: number;
    x: number;
    y: number;
    width: number;
    height: number;
    /** Degrees, clockwise, about the element's own centre. */
    rotation: number;
    /** 0..1, applied to the element as a group — box, stroke and content alike. */
    opacity: number;
    /** Ms elapsed since this element started; the time base for its keyframes. */
    localTimeMs: number;
};

/**
 * Colour adjustments on ffmpeg's `eq` scales, which is how they are stored.
 *
 * The painter implements ffmpeg's YUV maths rather than the CSS `filter`
 * equivalents, because the stored numbers only stay meaningful if the number
 * the user typed keeps producing the picture they saw.
 */
export type ResolvedAdjustments = {
    brightness: number;
    contrast: number;
    saturation: number;
};

/** How media fills its box when the aspect ratios disagree. */
export type MediaFit = 'cover' | 'contain' | 'fill';

export type ResolvedMediaElement = ResolvedElementBase & {
    kind: 'video' | 'image';
    assetId: number;
    /** Resolved asset URL, already origin-corrected for the current host. */
    url: string | null;
    fit: MediaFit;
    adjustments: ResolvedAdjustments;
    /**
     * Timestamp to sample from the SOURCE media, in seconds, with trim and
     * speed already folded in. Null for stills and for elements past their
     * source content, where the last frame is held.
     */
    sourceTimeSec: number | null;
    /** 0..1; still meaningful for images so a group can be faded as one. */
    volume: number;
    muted: boolean;
};

export type ResolvedTextElement = ResolvedElementBase & {
    kind: 'text';
    text: string;
    fontFamily: string;
    fontSize: number;
    fontWeight: 'normal' | 'bold';
    color: string;
    align: TextAlign;
    verticalAlign: VerticalAlign;
    padding: number;
    lineHeight: number;
    letterSpacing: number;
    /** Painted as the full element rect, not as a tight box around the glyphs. */
    backgroundColor: string | null;
    backgroundRadius: number;
    strokeColor: string | null;
    /** Stroke is drawn OUTWARD from the glyph outline, the editor convention. */
    strokeWidth: number;
};

export type ResolvedShapeElement = ResolvedElementBase & {
    kind: 'shape';
    shape: ShapeKind;
    fillColor: string | null;
    borderColor: string | null;
    borderWidth: number;
    cornerRadius: number;
};

export type ResolvedElement =
    | ResolvedMediaElement
    | ResolvedTextElement
    | ResolvedShapeElement;

/** One subtitle word, carrying whether the playhead has reached it. */
export type ResolvedSubtitleWord = {
    text: string;
    /** True once the playhead reaches the word and for the rest of the entry. */
    active: boolean;
    /** True only while the playhead is inside this word, for the emphasis pop. */
    current: boolean;
};

export type ResolvedSubtitle = {
    id: string;
    text: string;
    words: ResolvedSubtitleWord[];
    fontFamily: string;
    fontSize: number;
    color: string;
    highlightColor: string | null;
    backgroundColor: string | null;
    strokeColor: string | null;
    strokeWidth: number;
    position: 'top' | 'bottom';
    /** Distance from the chosen edge, in project pixels. */
    marginV: number;
    /** Horizontal inset from both edges, in project pixels. */
    marginH: number;
    uppercase: boolean;
};

/**
 * A complete, paintable description of one instant.
 *
 * Subtitles are held separately from elements because they are always painted
 * last: in the old code they sat above overlay clips in the export and below
 * them in the preview, which is exactly the class of divergence this type
 * exists to make impossible.
 */
export type ResolvedFrame = {
    timeMs: number;
    width: number;
    height: number;
    backgroundColor: string;
    elements: ResolvedElement[];
    subtitles: ResolvedSubtitle[];
};

/**
 * A frame plus, when the playhead sits inside a scene transition, the frame it
 * is crossfading into.
 *
 * Modelling a transition as two real frames and a progress value means the
 * preview shows the incoming scene during the transition instead of a fade to
 * black, and means the export can be produced by the same painter rather than
 * by a separate `xfade` pass.
 */
export type CompositedFrame = {
    primary: ResolvedFrame;
    transition?: {
        type: TransitionType;
        /** 0 at the start of the transition, 1 at the end. */
        progress: number;
        incoming: ResolvedFrame;
    };
};

/** Empty frame of a given size, used for gaps and as a resolve fallback. */
export function emptyFrame(
    timeMs: number,
    width: number,
    height: number,
    backgroundColor = '#000000',
): ResolvedFrame {
    return {
        timeMs,
        width,
        height,
        backgroundColor,
        elements: [],
        subtitles: [],
    };
}
