/**
 * The canvas compositor: one painter for the live preview and the export.
 *
 * Consumers take `drawFrame` and a `MediaLookup`; everything else exported here
 * is either a type or a pure helper that exists so the maths can be tested
 * without a canvas.
 */

export {
    drawElement,
    drawFrame,
    drawResolvedFrame,
    sortedElements,
} from './draw-frame';
export type { MediaLookup } from './draw-frame';
export {
    drawSubtitles,
    assignWordsToLines,
    CURRENT_WORD_SCALE,
} from './subtitles';
export {
    coveringRadius,
    dissolveNoise,
    drawTransition,
    releaseDissolveNoise,
    transitionPlan,
    writeDissolveMask,
    DISSOLVE_SEED,
} from './transitions';
export type { CircleMask, TransitionPlan } from './transitions';
export {
    applyEqToRgba,
    eqPixel,
    isNeutralAdjustments,
    NEUTRAL_ADJUSTMENTS,
} from './color-eq';
export {
    clamp01,
    clampCornerRadius,
    computeFitRects,
    insetRect,
    isFiniteRect,
    isPaintableSize,
    outwardStrokeWidth,
} from './geometry';
export type { DrawRects, Rect } from './geometry';
export { getScratch, releaseScratch } from './scratch';
export type { Scratch } from './scratch';
export { applyLetterSpacing, intrinsicSize, traceRoundedRect } from './context';
export type { Canvas2D } from './context';
