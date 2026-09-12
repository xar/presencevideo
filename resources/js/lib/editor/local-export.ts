import {
    AudioBufferSource,
    BufferTarget,
    CanvasSource,
    Mp4OutputFormat,
    Output,
    QUALITY_MEDIUM,
    canEncodeAudio,
    canEncodeVideo,
} from 'mediabunny';
import type { Project } from '@/types/editor';
import { drawFrame } from './compositor';
import type { Canvas2D } from './compositor/context';
import {
    browserAudioRenderDeps,
    planProjectAudio,
    renderAudioPlan,
    sliceAudioBuffer,
} from './export-audio';
import {
    getMediaCapabilities
    
} from './media-capabilities';
import type {MediaCapabilities} from './media-capabilities';
import {
    createExportMediaLookup
    
    
} from './media-lookup';
import type {ExportMediaLookup, ExportMediaRequest} from './media-lookup';
import type { CompositedFrame, ResolvedFrame } from './model/frame';
import { resolveFrame } from './model/resolve-frame';
import { buildTimeline } from './model/timeline';

/**
 * The browser export.
 *
 * This used to be a "quick preview": a third renderer that drew a static
 * thumbnail for every frame of a video, had its own crude copy of the
 * compositing rules, wrote no audio at all, and computed its duration by
 * summing scene lengths as though transitions did not overlap. It agreed with
 * neither the preview nor the server render.
 *
 * It is now the same pipeline as the preview, run on a clock instead of on
 * rAF: `resolveFrame` decides what the project means at time T, `drawFrame`
 * paints it, and the only thing this module adds is the encoder, the monotonic
 * decode of real video frames, and the audio mix. Anything that looks wrong in
 * the output is wrong in the shared model, and fixing it there fixes the
 * preview and the export together.
 */

/** Audio handed to the encoder one second at a time, for backpressure. */
const AUDIO_CHUNK_SEC = 1;

/** Share of the progress bar spent mixing audio before the frame loop starts. */
const AUDIO_PROGRESS_SHARE = 0.05;

export class LocalExportError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'LocalExportError';
    }
}

export type LocalExportProgress = {
    phase: 'audio' | 'video' | 'finalizing';
    frameIndex: number;
    totalFrames: number;
    /** 0-100, derived from the true frame position. */
    percent: number;
};

export type LocalExportResult = {
    blob: Blob;
    /** Frames actually encoded; derived from the transition-aware duration. */
    frameCount: number;
    durationMs: number;
    hasAudio: boolean;
    /**
     * Everything the output is missing relative to what was asked for —
     * undecodable assets, a dropped audio track. Surfaced to the user rather
     * than swallowed, because an export that quietly loses a clip is worse
     * than one that says so.
     */
    warnings: string[];
};

export type ExportEncoderSpec = {
    canvas: HTMLCanvasElement | OffscreenCanvas;
    width: number;
    height: number;
    fps: number;
    withAudio: boolean;
};

/** The encoder seam: everything the frame loop needs from the muxer. */
export type ExportEncoder = {
    readonly hasAudio: boolean;
    readonly warnings: readonly string[];
    addVideoFrame(timestampSec: number, durationSec: number): Promise<void>;
    addAudioChunk(buffer: AudioBuffer): Promise<void>;
    finish(): Promise<Blob>;
    /** Best-effort teardown when the export fails part way. */
    abort(): Promise<void>;
};

/**
 * Injectable collaborators.
 *
 * Every one of these is a browser API that jsdom does not have (WebCodecs,
 * canvas pixels, Web Audio, decoders), so this seam is what lets the export's
 * actual logic — frame counts, monotonic decode, backpressure, gain staging —
 * be tested rather than assumed.
 */
export type LocalExportDeps = {
    capabilities: () => MediaCapabilities;
    createCanvas: (
        width: number,
        height: number,
    ) => { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: Canvas2D } | null;
    createEncoder: (spec: ExportEncoderSpec) => Promise<ExportEncoder>;
    createLookup: () => ExportMediaLookup;
    mixAudio: (
        project: Project,
        durationMs: number,
    ) => Promise<AudioBuffer | null>;
    sliceAudio: (
        buffer: AudioBuffer,
        startFrame: number,
        frameCount: number,
    ) => AudioBuffer;
    draw: (
        ctx: Canvas2D,
        frame: CompositedFrame,
        media: ExportMediaLookup,
    ) => void;
};

export type LocalExportOptions = {
    /** Called with true progress; `percent` is `frameIndex / totalFrames`. */
    onProgress?: (progress: LocalExportProgress) => void;
    deps?: Partial<LocalExportDeps>;
};

/**
 * Whether this browser can export at all, and a sentence explaining it if not.
 *
 * Returned rather than thrown so the UI can disable the control and say why,
 * instead of offering an action that fails when clicked.
 */
export function localExportSupport(
    capabilities: MediaCapabilities = getMediaCapabilities(),
): {
    supported: boolean;
    reason: string | null;
} {
    if (!capabilities.canUseWebCodecs) {
        return {
            supported: false,
            reason: 'This browser has no WebCodecs support, so it cannot encode video. Use the server export, or try Chrome or Edge.',
        };
    }

    if (!capabilities.canUseOffscreenCanvas) {
        return {
            supported: false,
            reason: 'This browser cannot render to an OffscreenCanvas, which the exporter needs. Use the server export instead.',
        };
    }

    return { supported: true, reason: null };
}

/**
 * Every media source the frame needs, both sides of a transition included.
 *
 * Exported for testing and because the export loop must know what to decode
 * BEFORE it paints; the compositor itself is synchronous and cannot ask.
 */
export function frameMediaRequests(
    frame: CompositedFrame,
): ExportMediaRequest[] {
    const requests: ExportMediaRequest[] = [];

    const collect = (resolved: ResolvedFrame): void => {
        for (const element of resolved.elements) {
            if (element.kind !== 'video' && element.kind !== 'image') {
                continue;
            }

            if (!element.url) {
                continue;
            }

            requests.push({
                url: element.url,
                timeSec:
                    element.kind === 'video' ? element.sourceTimeSec : null,
            });
        }
    };

    collect(frame.primary);
    if (frame.transition) {
        collect(frame.transition.incoming);
    }

    return requests;
}

/** Frames the export will produce; the transition-aware duration decides. */
export function exportFrameCount(durationMs: number, fps: number): number {
    const rate = fps > 0 ? fps : 30;

    return Math.max(0, Math.round((durationMs / 1000) * rate));
}

/**
 * Export a project to an MP4 in the browser.
 *
 * The frame loop runs on the OUTPUT timeline — scene durations minus
 * transition overlap — so the file is exactly as long as the preview says it
 * is. Each frame resolves from a timeline built once, decodes whatever that
 * frame needs, paints it with the shared compositor, and awaits the encoder;
 * the await is the backpressure, and skipping it exhausts memory on any
 * project long enough to matter.
 */
export async function exportProjectVideo(
    project: Project | null | undefined,
    options: LocalExportOptions = {},
): Promise<LocalExportResult> {
    const deps = { ...defaultExportDeps(), ...options.deps };

    const support = localExportSupport(deps.capabilities());
    if (!support.supported) {
        throw new LocalExportError(
            support.reason ?? 'Exporting in this browser is not supported.',
        );
    }

    if (!project) {
        throw new LocalExportError('There is no project to export.');
    }

    const timeline = buildTimeline(project);
    const fps = project.fps || 30;
    const durationMs = timeline.durationMs;
    const totalFrames = exportFrameCount(durationMs, fps);

    if (totalFrames === 0) {
        throw new LocalExportError(
            'This project has no duration yet. Add a scene before exporting.',
        );
    }

    const width = project.resolution_width;
    const height = project.resolution_height;
    const surface = deps.createCanvas(width, height);

    if (!surface) {
        throw new LocalExportError(
            'This browser could not create a drawing surface for the export.',
        );
    }

    const warnings: string[] = [];

    options.onProgress?.({
        phase: 'audio',
        frameIndex: 0,
        totalFrames,
        percent: 0,
    });

    // Audio is mixed up front: the whole timeline goes through one offline
    // render so the stream fed to the encoder is gapless by construction,
    // which `AudioBufferSource` requires — it timestamps each buffer at the
    // total duration of the previous ones and accepts no explicit time.
    let mix: AudioBuffer | null = null;
    try {
        mix = await deps.mixAudio(project, durationMs);
    } catch {
        warnings.push('The audio mix failed, so this export is silent.');
    }

    const encoder = await deps.createEncoder({
        canvas: surface.canvas,
        width,
        height,
        fps,
        withAudio: mix !== null,
    });
    warnings.push(...encoder.warnings);

    if (mix && !encoder.hasAudio) {
        mix = null;
    }

    const lookup = deps.createLookup();
    const frameSec = 1 / fps;
    let audioFrameCursor = 0;
    let frameIndex = 0;

    try {
        for (frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
            const timeMs = (frameIndex * 1000) / fps;
            const frame = resolveFrame(project, timeMs, { timeline });

            await lookup.prepare(frameMediaRequests(frame));
            deps.draw(surface.ctx, frame, lookup);

            await encoder.addVideoFrame(frameIndex * frameSec, frameSec);

            if (mix) {
                audioFrameCursor = await pushAudioUpTo(
                    encoder,
                    deps,
                    mix,
                    audioFrameCursor,
                    (frameIndex + 1) * frameSec,
                );
            }

            options.onProgress?.({
                phase: 'video',
                frameIndex: frameIndex + 1,
                totalFrames,
                percent: progressPercent(frameIndex + 1, totalFrames),
            });
        }

        if (mix) {
            await pushAudioUpTo(
                encoder,
                deps,
                mix,
                audioFrameCursor,
                Number.POSITIVE_INFINITY,
            );
        }

        options.onProgress?.({
            phase: 'finalizing',
            frameIndex: totalFrames,
            totalFrames,
            percent: 100,
        });

        const blob = await encoder.finish();

        for (const url of lookup.undecodable) {
            warnings.push(
                `One asset could not be decoded in this browser and was left out: ${url}`,
            );
        }

        return {
            blob,
            frameCount: totalFrames,
            durationMs,
            hasAudio: mix !== null && encoder.hasAudio,
            warnings,
        };
    } catch (error) {
        await encoder.abort();
        throw error;
    } finally {
        // Decoders are a scarce, browser-capped resource and samples pin
        // decoder memory; leaking either stalls every later decode silently.
        await lookup.dispose();
    }
}

/**
 * Feed audio chunks until the mix has caught up with the video clock.
 *
 * Interleaving keeps the muxer's buffers small on a long export instead of
 * making it hold an entire audio track while the video encodes.
 */
async function pushAudioUpTo(
    encoder: ExportEncoder,
    deps: LocalExportDeps,
    mix: AudioBuffer,
    fromFrame: number,
    untilSec: number,
): Promise<number> {
    const chunkFrames = Math.max(
        1,
        Math.round(AUDIO_CHUNK_SEC * mix.sampleRate),
    );
    let cursor = fromFrame;

    while (cursor < mix.length && cursor / mix.sampleRate < untilSec) {
        const frames = Math.min(chunkFrames, mix.length - cursor);
        await encoder.addAudioChunk(deps.sliceAudio(mix, cursor, frames));
        cursor += frames;
    }

    return cursor;
}

function progressPercent(frameIndex: number, totalFrames: number): number {
    const share =
        AUDIO_PROGRESS_SHARE +
        (1 - AUDIO_PROGRESS_SHARE) * (frameIndex / totalFrames);

    return Math.min(100, Math.round(share * 100));
}

/* ------------------------------------------------------------------ */
/* browser defaults                                                    */
/* ------------------------------------------------------------------ */

function defaultExportDeps(): LocalExportDeps {
    return {
        capabilities: getMediaCapabilities,
        createCanvas: (width, height) => {
            const canvas = new OffscreenCanvas(width, height);
            const ctx = canvas.getContext('2d');

            return ctx ? { canvas, ctx } : null;
        },
        createEncoder: createMediabunnyEncoder,
        createLookup: () => createExportMediaLookup(),
        mixAudio: (project, durationMs) =>
            renderAudioPlan(
                planProjectAudio(project),
                durationMs,
                browserAudioRenderDeps(),
            ),
        sliceAudio: (buffer, startFrame, frameCount) =>
            sliceAudioBuffer(buffer, startFrame, frameCount),
        draw: drawFrame,
    };
}

/**
 * Build the mediabunny MP4 encoder.
 *
 * H.264 in MP4 at `QUALITY_MEDIUM` is kept from the original implementation:
 * it is the combination every browser and player accepts, and the server
 * render targets the same container. The audio track is added BEFORE
 * `output.start()` because mediabunny refuses tracks afterwards, and it is
 * dropped with a warning rather than failing the export when the browser
 * cannot encode AAC.
 */
async function createMediabunnyEncoder(
    spec: ExportEncoderSpec,
): Promise<ExportEncoder> {
    const warnings: string[] = [];

    if (
        !(await canEncodeVideo('avc', {
            width: spec.width,
            height: spec.height,
        }))
    ) {
        throw new LocalExportError(
            `This browser cannot encode H.264 at ${spec.width}x${spec.height}. Use the server export instead.`,
        );
    }

    const output = new Output({
        format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
        target: new BufferTarget(),
    });

    const videoSource = new CanvasSource(spec.canvas, {
        codec: 'avc',
        bitrate: QUALITY_MEDIUM,
    });
    output.addVideoTrack(videoSource);

    let audioSource: AudioBufferSource | null = null;

    if (spec.withAudio) {
        if (await canEncodeAudio('aac')) {
            audioSource = new AudioBufferSource({
                codec: 'aac',
                bitrate: QUALITY_MEDIUM,
            });
            output.addAudioTrack(audioSource);
        } else {
            warnings.push(
                'This browser cannot encode AAC audio, so the exported file has no sound.',
            );
        }
    }

    await output.start();

    return {
        hasAudio: audioSource !== null,
        warnings,
        addVideoFrame: (timestampSec, durationSec) =>
            videoSource.add(timestampSec, durationSec),
        addAudioChunk: async (buffer) => {
            await audioSource?.add(buffer);
        },
        finish: async () => {
            await output.finalize();

            if (!output.target.buffer) {
                throw new LocalExportError(
                    'The export finished without producing a video file.',
                );
            }

            return new Blob([output.target.buffer], { type: 'video/mp4' });
        },
        abort: async () => {
            await output.cancel().catch(() => undefined);
        },
    };
}
