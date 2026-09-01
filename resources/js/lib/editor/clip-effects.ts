import type { ImageLayer, Layer, LayerAdjustments, VideoLayer } from '@/types';

/** Mirrors FFmpegService::MIN_SPEED / MAX_SPEED. */
export const MIN_SPEED = 0.25;
export const MAX_SPEED = 4;

/** CapCut-style speed stops offered next to the free numeric input. */
export const SPEED_STOPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4] as const;

/**
 * Neutral values on ffmpeg's `eq` scales: brightness -1..1 (0 neutral),
 * contrast 0..2 (1 neutral), saturation 0..2 (1 neutral).
 */
export const NEUTRAL_ADJUSTMENTS: Required<LayerAdjustments> = {
    brightness: 0,
    contrast: 1,
    saturation: 1,
};

export function clampSpeed(speed: number | undefined | null): number {
    if (typeof speed !== 'number' || !Number.isFinite(speed)) return 1;

    return Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed));
}

export function formatSpeed(speed: number): string {
    return `${parseFloat(speed.toFixed(2))}x`;
}

/** Fills in neutral defaults for any adjustment the layer does not carry. */
export function resolveAdjustments(
    adjustments: LayerAdjustments | undefined | null
): Required<LayerAdjustments> {
    return {
        brightness: adjustments?.brightness ?? NEUTRAL_ADJUSTMENTS.brightness,
        contrast: adjustments?.contrast ?? NEUTRAL_ADJUSTMENTS.contrast,
        saturation: adjustments?.saturation ?? NEUTRAL_ADJUSTMENTS.saturation,
    };
}

export function isNeutralAdjustments(adjustments: LayerAdjustments | undefined | null): boolean {
    const { brightness, contrast, saturation } = resolveAdjustments(adjustments);

    return brightness === NEUTRAL_ADJUSTMENTS.brightness
        && contrast === NEUTRAL_ADJUSTMENTS.contrast
        && saturation === NEUTRAL_ADJUSTMENTS.saturation;
}

/**
 * CSS approximation of the render-side `eq` filter. CSS `brightness()` is
 * multiplicative where ffmpeg's brightness is an additive offset, so the stored
 * -1..1 value is applied as a `1 + b` multiplier. Neutral values return `none`
 * so an unadjusted layer renders byte-identically to having no filter at all.
 */
export function adjustmentsToCssFilter(adjustments: LayerAdjustments | undefined | null): string {
    if (isNeutralAdjustments(adjustments)) return 'none';

    const { brightness, contrast, saturation } = resolveAdjustments(adjustments);

    return `brightness(${1 + brightness}) contrast(${contrast}) saturate(${saturation})`;
}

/** Whether the given layer/clip supports colour adjustments. */
export function supportsAdjustments(layer: Layer): layer is VideoLayer | ImageLayer {
    return layer.type === 'video' || layer.type === 'image';
}

/** Only video carries a playback speed. */
export function supportsSpeed(element: Layer): element is VideoLayer {
    return element.type === 'video';
}

/** Human label for an element type, used in inspector headings and buttons. */
export function elementTypeLabel(element: Layer, placement: 'layer' | 'clip' = 'layer'): string {
    switch (element.type) {
        case 'text':
            return placement === 'clip' ? 'Text Overlay' : 'Text Layer';
        case 'image':
            return placement === 'clip' ? 'Image Clip' : 'Image Layer';
        case 'shape':
            return 'Shape';
        default:
            return placement === 'clip' ? 'Video Clip' : 'Video Layer';
    }
}

/** '' / 'transparent' / 'none' mean "no paint", matching the render's colour handling. */
export function cssPaintColor(color: string | undefined | null, fallback = 'transparent'): string {
    if (!color || color === 'transparent' || color === 'none') return fallback;
    return color;
}

/** Clamps a layer volume into the 0–1 range used by the render. */
export function clampVolume(volume: number | undefined | null): number {
    if (typeof volume !== 'number' || !Number.isFinite(volume)) return 1;

    return Math.min(1, Math.max(0, volume));
}

/**
 * How far into the scene a video layer still has source frames, in ms.
 *
 * The trimmed source range is consumed at `speed`, so a 6s clip trimmed to 4s
 * at 2x only covers 2s of scene time. Returns null when the asset duration is
 * unknown (no trim end and no metadata), in which case nothing can be said
 * about where the clip ends.
 */
export function videoLayerContentEndMs(
    layer: VideoLayer,
    assetDurationMs: number | null | undefined,
): number | null {
    const trimStart = Math.max(0, layer.trim_start_ms ?? 0);
    const trimEnd = layer.trim_end_ms ?? assetDurationMs ?? null;

    if (trimEnd === null || !Number.isFinite(trimEnd)) return null;

    const sourceMs = Math.max(0, trimEnd - trimStart);

    return Math.round(sourceMs / clampSpeed(layer.speed));
}
