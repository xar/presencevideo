export const editorFeatures = {
    clientMetadata: true,
    clientThumbnails: true,
    clientVideoCompression: true,
    clientPreviewFrames: true,
    clientPreviewExport: true,
    audioWaveforms: true,
    frameAccurateDecode: true,
};

export const mediaLimits = {
    compressVideoAboveBytes: 75 * 1024 * 1024,
    uploadThumbnailWidth: 320,
    previewFrameWidth: 640,
    waveformBars: 80,
    /**
     * Decoded frames a single provider keeps for backward scrubs. Preview
     * frames are decoded at DISPLAY size rather than source size (see
     * `previewDecodeSize`), so a frame costs roughly a tenth of a full-res one
     * and far more of them fit inside the same memory budget.
     */
    previewFrameCacheCount: 120,
    /**
     * Approximate decoded bytes per provider. Preview frames are canvases, so
     * they cost 4 bytes per pixel (RGBA) rather than a YUV sample's 1.5 — but
     * at ~640px wide that is still under 3 MB each, where a 1080x1920 source
     * frame was ~8 MB.
     */
    previewFrameCacheBytes: 192 * 1024 * 1024,
    /** Browsers cap concurrent hardware decoders well below clip counts. */
    concurrentPreviewDecoders: 3,
    /**
     * How far ahead of the playhead preview VIDEO is decoded while playing.
     * Read-ahead is what turns decode latency from visible lag into slack: the
     * decoder works on frames the playhead has not reached yet, and mediabunny
     * takes its optimized single-decode-per-packet path because the timestamps
     * arrive monotonically sorted.
     */
    previewPrefetchAheadMs: 500,
    /**
     * Read-ahead frames pulled in one turn before the demand lane is checked
     * again. Backpressure itself comes from simply not pulling — mediabunny's
     * sequential sink caps its own decode queue at 8 and blocks — so this is
     * the RESPONSIVENESS bound: it decides how long a scrub can sit behind a
     * read-ahead run before it is served.
     */
    previewPrefetchMaxInFlight: 6,
    /**
     * How far the playhead may overtake the read-ahead run before the run is
     * abandoned and reopened at the playhead.
     *
     * Slack, not zero, because a run that has fallen one frame behind is still
     * the right run — reopening costs a seek to the preceding key packet and a
     * re-decode, and doing that on every frame of a brief stall would turn a
     * hiccup into a permanent one.
     */
    previewPrefetchRetargetMs: 250,
    /**
     * Preview decode sizing. The decode target is the size the frame is
     * actually PAINTED at, rounded UP to this step so that dragging a splitter
     * a few pixels does not rebuild the decoder on every resize.
     */
    previewDecodeStepPx: 160,
    /** Never decode smaller than this, however tiny the preview pane gets. */
    previewDecodeMinPx: 320,
    /** Never decode larger than this on the long edge, however big the pane. */
    previewDecodeMaxPx: 1280,
    /**
     * How far ahead of the playhead preview audio is decoded and scheduled.
     * Wide enough that a decode has time to land before its cue is due, narrow
     * enough that a long project does not decode every clip at once.
     */
    audioScheduleAheadMs: 2000,
    /**
     * Interval between preview audio scheduling passes. The scheduler only has
     * to beat the lookahead, so this is cheap; the AUDIO thread, not this
     * timer, decides when a scheduled cue actually sounds.
     */
    audioSchedulePumpMs: 150,
    /**
     * Audio decodes in flight at once. Deliberately below
     * `concurrentPreviewDecoders`: audio and video decode compete for the same
     * capped provider slots, and a stalled picture is more visible than a late
     * cue.
     */
    concurrentAudioDecodes: 2,
    /** Distance from the playhead beyond which an audio provider is released. */
    audioProviderKeepMs: 10000,
};

/** Pixel dimensions a preview frame should be decoded at. */
export type PreviewDecodeSize = { width: number; height: number };

/**
 * Decode policy for preview frames.
 *
 * A 1080x1920 source painted into a ~265 CSS px pane is decoded ten times
 * larger than anything that reaches the screen, and every one of those pixels
 * costs decode time, memory bandwidth and cache budget. So the decode is sized
 * to the SURFACE it will be drawn on instead.
 *
 * - The ratio is the COVER ratio, not contain: an element cropped to fill the
 *   pane shows only part of the source, and sizing by `contain` would soften
 *   it. Cover is never smaller than what is displayed.
 * - Scale is clamped to 1 so a small source is never upscaled — upscaling would
 *   cost memory and add nothing the compositor cannot do while drawing.
 * - The result is rounded UP to `previewDecodeStepPx`, so the handful of
 *   distinct sizes a resizable pane produces do not each rebuild the decoder.
 * - Aspect ratio is preserved exactly, so the sink's `fit` never letterboxes.
 *
 * Returns null when either size is unknown, meaning "decode at source size".
 */
export function previewDecodeSize(
    source: PreviewDecodeSize,
    surface: PreviewDecodeSize | null,
): PreviewDecodeSize | null {
    if (!surface || !isPositive(source) || !isPositive(surface)) {
        return null;
    }

    const cover = Math.max(
        surface.width / source.width,
        surface.height / source.height,
    );
    const step = Math.max(1, mediaLimits.previewDecodeStepPx);
    const longest = Math.max(source.width, source.height);

    const wanted = Math.min(
        longest,
        Math.max(
            mediaLimits.previewDecodeMinPx,
            Math.min(
                mediaLimits.previewDecodeMaxPx,
                Math.ceil((longest * Math.min(1, cover)) / step) * step,
            ),
        ),
    );

    if (wanted >= longest) {
        return null;
    }

    const scale = wanted / longest;

    return {
        width: Math.max(2, Math.round(source.width * scale)),
        height: Math.max(2, Math.round(source.height * scale)),
    };
}

function isPositive(size: PreviewDecodeSize): boolean {
    return (
        Number.isFinite(size.width) &&
        Number.isFinite(size.height) &&
        size.width > 0 &&
        size.height > 0
    );
}
