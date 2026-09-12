import {
    ALL_FORMATS,
    AudioBufferSink,
    CanvasSink,
    Input,
    UrlSource,
    VideoSampleSink,
} from 'mediabunny';
import type {
    InputAudioTrack,
    InputVideoTrack,
    VideoSample,
    WrappedAudioBuffer,
    WrappedCanvas,
} from 'mediabunny';
import {
    editorFeatures,
    mediaLimits,
    previewDecodeSize,
} from './editor-features';
import type { PreviewDecodeSize } from './editor-features';
import {
    recordCacheHit,
    recordCacheMiss,
    recordDecodeComplete,
    recordDecodeRequest,
} from './perf-monitor';

/**
 * Frame-accurate media access for the compositor.
 *
 * Two access patterns share one decoder-owning object per asset URL.
 *
 * PREVIEW runs over a `CanvasSink` sized to the surface the frame is painted
 * on, not to the source. A 1080x1920 clip in a 265px pane decoded at full size
 * costs ~8 MB per frame and spends most of its decode budget on pixels that are
 * scaled away before anyone sees them. It has two lanes:
 *
 * - DEMAND — the frame the renderer is asking for right now — goes through
 *   `getCanvas`, which seeks, decodes and FLUSHES, so the frame actually comes
 *   out. Demands coalesce down to the newest one, so a fast scrub decodes where
 *   the pointer ended up rather than every point it crossed.
 * - READ-AHEAD, issued only while playing, pulls from an open `canvases()` run:
 *   one decoder for the whole run, pre-decoding a few frames ahead and emitting
 *   continuously. This is what turns decode latency into slack — the decoder
 *   works on frames the playhead has not reached yet.
 *
 *   Read-ahead deliberately does NOT go through `canvasesAtTimestamps`. That
 *   pipeline only flushes its decoder when a timestamp crosses into a new key
 *   packet or when the timestamp iterator ENDS, so feeding it a never-ending
 *   queue of timestamps inside one GOP emits nothing at all — the picture
 *   simply stops updating until the playhead happens to leave the GOP.
 *
 * EXPORT walks strictly forward at FULL RESOLUTION and wants mediabunny's
 * pre-decode-ahead pipeline, which `openSequential()` exposes over a private
 * `VideoSampleSink` so it never perturbs the preview cache or its decoder, and
 * is never subject to the preview's downscaling.
 *
 * Decoders are a scarce, browser-capped resource, so providers are refcounted
 * per URL and only a limited number may hold a live preview decoder at once.
 */

/** Keeps retrieval off the exact boundary, matching `mediabunny.ts` clamping. */
const TIMESTAMP_EPSILON = 0.001;

/** Used when a track reports no usable packet rate, so keys stay finite. */
const FALLBACK_FPS = 30;

/** Preview frames are canvases, so they are RGBA rather than planar YUV. */
const CANVAS_BYTES_PER_PIXEL = 4;

/** Whether the playhead is running; decides if read-ahead is worth issuing. */
export type PreviewPlaybackMode = 'idle' | 'playing';

export type MediaReadiness = {
    /** False for audio-only, unreadable, or unsupported-codec assets. */
    canDecode: boolean;
    fps: number;
    durationSec: number;
    /**
     * Tracks do not have to start at zero (and may start negative), so every
     * caller-supplied offset is resolved against this value.
     */
    firstTimestampSec: number;
    displayWidth: number;
    displayHeight: number;
    hasAudio: boolean;
};

/**
 * A decoded preview frame.
 *
 * `source` is a canvas OWNED BY THE PROVIDER for as long as it stays cached,
 * and it is safe to hold across ticks: the preview sink runs with NO canvas
 * pool, so no canvas is ever recycled underneath a holder. See
 * `createPreviewSink` for why the pool is deliberately left off.
 */
export type PreviewFrame = {
    source: CanvasImageSource;
    /** Source timestamp of the frame, in seconds. */
    timestamp: number;
    /** Frame duration in seconds; 0 when the container did not say. */
    duration: number;
};

export type MediaProvider = {
    readonly url: string;
    /** Number of outstanding `acquireMediaProvider` calls. */
    readonly refCount: number;
    readonly hasAudio: boolean;
    /** True while a demanded (non-read-ahead) decode has not yet landed. */
    readonly isDecodePending: boolean;
    /** Memoized; never rejects — undecodable assets resolve to a clean state. */
    ready(): Promise<MediaReadiness>;
    /**
     * Synchronous cache read for the render loop. Returns null on a miss; call
     * `requestFrame` to schedule the decode and try again on a later frame.
     */
    frameAt(timeSec: number): PreviewFrame | null;
    /** Fire-and-forget decode request; later calls supersede earlier ones. */
    requestFrame(timeSec: number): void;
    /**
     * Tell the provider whether the playhead is running. Read-ahead is issued
     * only in `'playing'`; in `'idle'` the queue keeps its coalescing
     * scrub behaviour, which is what random access actually wants.
     *
     * This is a setter rather than a store import on purpose: the decode layer
     * stays headless and testable.
     */
    setPlaybackMode(mode: PreviewPlaybackMode): void;
    /**
     * Declare the pixel size preview frames are painted at, so the decode can
     * be sized to it. Passing null decodes at source resolution.
     */
    setPreviewSurface(surface: PreviewDecodeSize | null): void;
    /**
     * Monotonic FULL-RESOLUTION read for export, over a private sink so the
     * preview cache and its capped decoder slots are untouched.
     *
     * OWNERSHIP: the generator closes each sample as soon as you ask for the
     * next one, so ONE-SAMPLE LOOKAHEAD IS NOT POSSIBLE — pulling the next
     * sample invalidates the one you are holding. A consumer that needs to know
     * whether a sample still covers a given time must decide from that sample's
     * own `timestamp`/`duration` before advancing, never by peeking ahead.
     */
    openSequential(
        startSec: number,
        endSec: number,
    ): AsyncGenerator<VideoSample, void, unknown>;
    getAudioBuffers(
        startSec: number,
        endSec: number,
    ): AsyncGenerator<WrappedAudioBuffer, void, unknown>;
    release(): void;
};

const UNDECODABLE: MediaReadiness = {
    canDecode: false,
    fps: FALLBACK_FPS,
    durationSec: 0,
    firstTimestampSec: 0,
    displayWidth: 0,
    displayHeight: 0,
    hasAudio: false,
};

type CachedFrame = {
    frame: PreviewFrame;
    index: number;
    bytes: number;
};

/**
 * Rewrites an asset URL onto the page's own origin. Herd serves the same host
 * over both http and https; a stored asset URL carrying the wrong scheme is
 * either blocked as mixed content or drops the session cookie, so the scheme
 * and port are taken from the current document whenever the host matches.
 */
export function toCurrentOriginUrl(url: string): string {
    if (typeof window === 'undefined') {
        return url;
    }

    const parsedUrl = new URL(url, window.location.href);

    if (parsedUrl.hostname === window.location.hostname) {
        parsedUrl.protocol = window.location.protocol;
        parsedUrl.port = window.location.port;
    }

    return parsedUrl.toString();
}

/**
 * The single place a mediabunny `UrlSource` is built. `credentials: 'include'`
 * is load-bearing: asset routes are behind the session guard, and mediabunny's
 * range requests would otherwise come back as redirects to the login page.
 */
export function createUrlSource(url: string): UrlSource {
    return new UrlSource(toCurrentOriginUrl(url), {
        requestInit: {
            credentials: 'include',
        },
    });
}

/**
 * Providers currently allowed to hold a live preview decoder, least recently
 * requested first. Browsers cap concurrent hardware decoders well below the
 * number of clips a project may reference, so the surplus is torn down.
 */
const activePreviews: MediaProviderImpl[] = [];

function touchPreviewSlot(provider: MediaProviderImpl): void {
    const existing = activePreviews.indexOf(provider);
    if (existing !== -1) {
        activePreviews.splice(existing, 1);
    }
    activePreviews.push(provider);

    while (activePreviews.length > mediaLimits.concurrentPreviewDecoders) {
        activePreviews.shift()?.closePreview();
    }
}

function dropPreviewSlot(provider: MediaProviderImpl): void {
    const index = activePreviews.indexOf(provider);
    if (index !== -1) {
        activePreviews.splice(index, 1);
    }
}

class MediaProviderImpl implements MediaProvider {
    readonly url: string;

    private refs = 1;
    private disposed = false;

    private input: Input | null = null;
    private videoTrack: InputVideoTrack | null = null;
    private audioTrack: InputAudioTrack | null = null;
    private sink: CanvasSink | null = null;
    private audioSink: AudioBufferSink | null = null;

    private readyPromise: Promise<MediaReadiness> | null = null;
    private metadata: MediaReadiness | null = null;

    private readonly frames = new Map<number, CachedFrame>();
    private cachedBytes = 0;

    private previewOpen = false;
    private pumping = false;

    /** The frame the renderer wants NOW; always jumps the read-ahead queue. */
    private pendingTimestamp: number | null = null;
    /** Open forward decode run used for read-ahead while playing. */
    private stream: AsyncGenerator<WrappedCanvas, void, unknown> | null = null;
    /** Timestamp of the newest frame pulled off `stream`. */
    private streamHeadSec = Number.NEGATIVE_INFINITY;
    /** Source time the read-ahead should stay decoded up to. */
    private prefetchUntilSec = Number.NEGATIVE_INFINITY;

    private mode: PreviewPlaybackMode = 'idle';
    private surface: PreviewDecodeSize | null = null;
    /**
     * The size the live preview sink was built for, as a comparable key, or
     * null when no sink is open. A change to it has to rebuild the decoder.
     */
    private decodeSizeKey: string | null = null;

    constructor(url: string) {
        this.url = url;
    }

    get refCount(): number {
        return this.refs;
    }

    get hasAudio(): boolean {
        return this.metadata?.hasAudio ?? false;
    }

    get isDecodePending(): boolean {
        return this.pendingTimestamp !== null || this.pumping;
    }

    retain(): void {
        this.refs++;
    }

    release(): void {
        if (this.refs <= 0) {
            return;
        }

        this.refs--;

        if (this.refs === 0) {
            this.dispose();
        }
    }

    ready(): Promise<MediaReadiness> {
        this.readyPromise ??= this.loadMetadata();

        return this.readyPromise;
    }

    setPlaybackMode(mode: PreviewPlaybackMode): void {
        if (this.mode === mode) {
            return;
        }

        this.mode = mode;

        if (mode === 'idle') {
            // Read-ahead past a stopped playhead is work nobody asked for, and
            // a paused decoder run holds a decoder open for nothing.
            this.prefetchUntilSec = Number.NEGATIVE_INFINITY;
            void this.closeStream();
        }
    }

    setPreviewSurface(surface: PreviewDecodeSize | null): void {
        const changed =
            (this.surface === null) !== (surface === null) ||
            (surface !== null &&
                this.surface !== null &&
                (surface.width !== this.surface.width ||
                    surface.height !== this.surface.height));

        if (!changed) {
            return;
        }

        this.surface = surface ? { ...surface } : null;

        // Only a change that actually moves the decode target is worth paying
        // for; the step rounding means most resizes land on the same size.
        if (
            this.decodeSizeKey !== null &&
            this.decodeSizeKey !== sizeKey(this.wantedDecodeSize())
        ) {
            this.closePreview();
        }
    }

    frameAt(timeSec: number): PreviewFrame | null {
        const hit = this.lookupFrame(timeSec);

        if (hit) {
            recordCacheHit();

            return hit.frame;
        }

        if (this.metadata?.canDecode && Number.isFinite(timeSec)) {
            recordCacheMiss(this.mode === 'playing');
        }

        return null;
    }

    requestFrame(timeSec: number): void {
        if (
            this.disposed ||
            !editorFeatures.frameAccurateDecode ||
            !Number.isFinite(timeSec)
        ) {
            return;
        }

        void this.schedule(timeSec);
    }

    /**
     * Sequential export read at FULL SOURCE RESOLUTION. Uses a private
     * `VideoSampleSink` so the shared preview decoder, its cache and its
     * preview-sized downscale are all untouched, and holds at most the current
     * and previous sample.
     *
     * The previous sample is closed the moment the consumer asks for the next
     * one, so a consumer cannot hold two at once and cannot peek ahead to test
     * the following frame — see the ownership note on `MediaProvider`.
     */
    async *openSequential(
        startSec: number,
        endSec: number,
    ): AsyncGenerator<VideoSample, void, unknown> {
        const metadata = await this.ready();

        if (this.disposed || !metadata.canDecode || !this.videoTrack) {
            return;
        }

        const from = this.clampTime(startSec);
        const to = Math.max(from, this.clampTime(endSec));
        const sink = new VideoSampleSink(this.videoTrack);
        const samples = sink.samples(from, to);
        let previous: VideoSample | null = null;

        try {
            for await (const sample of samples) {
                previous?.close();
                previous = sample;
                yield sample;
            }
        } finally {
            previous?.close();
            await samples.return?.(undefined);
        }
    }

    async *getAudioBuffers(
        startSec: number,
        endSec: number,
    ): AsyncGenerator<WrappedAudioBuffer, void, unknown> {
        await this.ready();

        if (this.disposed || !this.audioTrack) {
            return;
        }

        this.audioSink ??= new AudioBufferSink(this.audioTrack);
        const buffers = this.audioSink.buffers(startSec, endSec);

        try {
            for await (const buffer of buffers) {
                yield buffer;
            }
        } finally {
            await buffers.return?.(undefined);
        }
    }

    /**
     * Releases the preview decoder while keeping the resolved metadata, so a
     * later `requestFrame` can lazily re-open. Cached frames go too: a decoded
     * canvas pins GPU memory, which is the resource this teardown exists to
     * reclaim.
     */
    closePreview(): void {
        dropPreviewSlot(this);
        this.previewOpen = false;
        this.pendingTimestamp = null;
        this.prefetchUntilSec = Number.NEGATIVE_INFINITY;
        this.sink = null;
        this.decodeSizeKey = null;
        void this.closeStream();
        this.clearFrames();
    }

    private dispose(): void {
        this.disposed = true;
        this.closePreview();
        this.audioSink = null;
        this.videoTrack = null;
        this.audioTrack = null;

        if (providers.get(this.url) === this) {
            providers.delete(this.url);
        }

        try {
            this.input?.dispose();
        } catch {
            // Disposal is best-effort; a failed teardown must not propagate.
        }

        this.input = null;
    }

    private async loadMetadata(): Promise<MediaReadiness> {
        const settle = (metadata: MediaReadiness): MediaReadiness => {
            this.metadata = metadata;

            if (this.disposed) {
                try {
                    this.input?.dispose();
                } catch {
                    // See dispose().
                }
            }

            return metadata;
        };

        try {
            const input = new Input({
                source: createUrlSource(this.url),
                formats: ALL_FORMATS,
            });
            this.input = input;

            if (!(await input.canRead().catch(() => false))) {
                return settle(UNDECODABLE);
            }

            const [videoTrack, audioTrack] = await Promise.all([
                input.getPrimaryVideoTrack().catch(() => null),
                input.getPrimaryAudioTrack().catch(() => null),
            ]);
            this.audioTrack = audioTrack;
            const hasAudio = Boolean(audioTrack);

            if (
                !videoTrack ||
                !(await videoTrack.canDecode().catch(() => false))
            ) {
                return settle({ ...UNDECODABLE, hasAudio });
            }

            const [stats, durationSec, firstTimestampSec, width, height] =
                await Promise.all([
                    videoTrack.computePacketStats(50).catch(() => null),
                    videoTrack.computeDuration().catch(() => 0),
                    videoTrack.getFirstTimestamp().catch(() => 0),
                    videoTrack.getDisplayWidth().catch(() => 0),
                    videoTrack.getDisplayHeight().catch(() => 0),
                ]);

            const fps = stats?.averagePacketRate;
            this.videoTrack = videoTrack;

            return settle({
                canDecode: true,
                fps:
                    fps && Number.isFinite(fps) && fps > 0 ? fps : FALLBACK_FPS,
                durationSec: Number.isFinite(durationSec) ? durationSec : 0,
                firstTimestampSec: Number.isFinite(firstTimestampSec)
                    ? firstTimestampSec
                    : 0,
                displayWidth: width ?? 0,
                displayHeight: height ?? 0,
                hasAudio,
            });
        } catch {
            return settle(UNDECODABLE);
        }
    }

    /** Decode dimensions implied by the declared surface, or null for source. */
    private wantedDecodeSize(): PreviewDecodeSize | null {
        const metadata = this.metadata;

        if (!metadata?.canDecode) {
            return null;
        }

        return previewDecodeSize(
            { width: metadata.displayWidth, height: metadata.displayHeight },
            this.surface,
        );
    }

    /**
     * Builds the preview sink at the current decode size.
     *
     * `poolSize` is deliberately NOT set. A pooled canvas is reused round-robin
     * and overwritten by a later frame, which would silently swap the picture
     * under every cached frame and under the lookup's held "last frame". The
     * LRU cache already bounds how many canvases exist at once, so the pool
     * would only trade a correctness hazard for an allocation that the cache
     * budget has already accounted for.
     */
    private previewSink(): CanvasSink | null {
        if (!this.videoTrack) {
            return null;
        }

        const size = this.wantedDecodeSize();

        if (this.sink && this.decodeSizeKey === sizeKey(size)) {
            return this.sink;
        }

        this.decodeSizeKey = sizeKey(size);
        this.sink = new CanvasSink(
            this.videoTrack,
            size ? { width: size.width, height: size.height, fit: 'fill' } : {},
        );

        return this.sink;
    }

    private async schedule(timeSec: number): Promise<void> {
        const metadata = await this.ready();

        if (this.disposed || !metadata.canDecode || !this.videoTrack) {
            return;
        }

        this.previewOpen = true;
        touchPreviewSlot(this);

        /**
         * Refreshing the scheduler slot above matters even on a cache hit, so
         * a clip being scrubbed entirely out of cache does not lose its frames
         * to another provider's eviction.
         */
        const clamped = this.clampTime(timeSec);
        const cached = this.lookupFrame(timeSec) !== null;

        if (this.mode === 'playing') {
            const aheadSec = Math.max(
                0,
                mediaLimits.previewPrefetchAheadMs / 1000,
            );
            this.prefetchUntilSec = clamped + aheadSec;

            /**
             * The open run is kept whenever the playhead is still inside the
             * window it is feeding, even if it has fallen behind: reopening
             * costs a flush and a re-decode from the preceding key packet,
             * which is the one thing worth avoiding. It is only rebuilt when
             * the playhead has actually gone somewhere else.
             */
            if (
                this.stream &&
                (clamped < this.streamHeadSec - aheadSec ||
                    clamped > this.streamHeadSec + aheadSec)
            ) {
                void this.closeStream();
            }
        }

        if (!cached) {
            /**
             * The demanded frame always jumps the read-ahead. Older demands are
             * simply overwritten, so a fast scrub decodes where the pointer
             * ended up rather than every point it crossed.
             */
            this.pendingTimestamp = clamped;
        }

        void this.pump();
    }

    /**
     * Drains the demand lane, then the read-ahead lane, then stops.
     *
     * There is no parking and no wake-up: the pump simply runs until there is
     * nothing left to do, and the next `requestFrame` restarts it. At most ONE
     * decode is ever outstanding, which is what keeps a scrub from queueing
     * behind read-ahead — the demand lane is re-checked between every single
     * frame.
     */
    private async pump(): Promise<void> {
        if (this.pumping) {
            return;
        }

        this.pumping = true;

        try {
            while (!this.disposed && this.previewOpen) {
                const demand = this.pendingTimestamp;

                if (demand !== null) {
                    this.pendingTimestamp = null;
                    await this.decodeDemand(demand);
                    continue;
                }

                if (!(await this.pullAhead())) {
                    return;
                }
            }
        } catch {
            // A decoder failure must not reach the render loop; the next
            // request builds a fresh sink and tries again.
            this.sink = null;
            this.decodeSizeKey = null;
            await this.closeStream();
        } finally {
            this.pumping = false;
        }
    }

    /**
     * Random access for the frame the renderer is waiting on.
     *
     * `getCanvas` is a self-contained decode: it seeks to the preceding key
     * packet, decodes forward and FLUSHES, so the frame actually comes out.
     * That last part is why a scrub cannot be served from the same long-lived
     * timestamp pipeline the read-ahead uses — that pipeline only flushes when
     * it crosses a key packet, so a run of timestamps inside one GOP emits
     * nothing at all until the playhead happens to leave it.
     */
    private async decodeDemand(timeSec: number): Promise<void> {
        const sink = this.previewSink();

        if (!sink) {
            return;
        }

        const key = `${this.url}#${this.frameIndex(timeSec)}`;
        recordDecodeRequest(key, false);

        const wrapped = await sink.getCanvas(timeSec);

        recordDecodeComplete(key);

        if (wrapped && !this.disposed && this.previewOpen) {
            this.storeFrame(wrapped);
        }
    }

    /**
     * Pulls the next frames of the forward decode run, ahead of the playhead.
     *
     * `canvases()` is mediabunny's sequential pipeline: one decoder for the
     * whole run, pre-decoding a few frames ahead and emitting continuously.
     * Feeding playback from it is what turns decode latency into slack — the
     * decoder is working on frames the playhead has not reached yet.
     *
     * Backpressure is "stop pulling": the sink caps its own decode queue and
     * blocks, and we stop as soon as the cache reaches the read-ahead horizon.
     * At most `previewPrefetchMaxInFlight` frames are pulled before the demand
     * lane is checked again, so a scrub is never stuck behind a long run.
     *
     * Returns false when there is nothing more to read ahead for.
     */
    private async pullAhead(): Promise<boolean> {
        if (
            this.mode !== 'playing' ||
            this.streamHeadSec >= this.prefetchUntilSec
        ) {
            return false;
        }

        const stream = this.openStream();

        if (!stream) {
            return false;
        }

        for (
            let pulled = 0;
            pulled < mediaLimits.previewPrefetchMaxInFlight;
            pulled++
        ) {
            if (this.pendingTimestamp !== null) {
                return true;
            }

            if (this.streamHeadSec >= this.prefetchUntilSec) {
                return false;
            }

            const key = `${this.url}#${this.frameIndex(this.streamHeadSec)}`;
            recordDecodeRequest(key, true);
            const next = await stream.next();

            if (next.done || this.disposed || !this.previewOpen) {
                await this.closeStream();
                return false;
            }

            recordDecodeComplete(key);
            this.streamHeadSec = next.value.timestamp;
            this.storeFrame(next.value);
        }

        return true;
    }

    private openStream(): AsyncGenerator<WrappedCanvas, void, unknown> | null {
        if (this.stream) {
            return this.stream;
        }

        const sink = this.previewSink();

        if (!sink) {
            return null;
        }

        const metadata = this.metadata;
        const from = this.clampTime(
            Math.max(
                this.prefetchUntilSec -
                    mediaLimits.previewPrefetchAheadMs / 1000,
                metadata?.firstTimestampSec ?? 0,
            ),
        );

        this.streamHeadSec = from;
        this.stream = sink.canvases(from);

        return this.stream;
    }

    private async closeStream(): Promise<void> {
        const stream = this.stream;
        this.stream = null;
        this.streamHeadSec = Number.NEGATIVE_INFINITY;

        if (stream) {
            await stream.return?.(undefined).catch(() => undefined);
        }
    }

    private storeFrame(wrapped: WrappedCanvas): void {
        const index = this.frameIndex(wrapped.timestamp);
        const existing = this.frames.get(index);

        if (existing) {
            /**
             * Keep the frame already handed out: the renderer may be drawing
             * from it in this very tick, and both canvases show the same frame.
             */
            this.touchFrame(existing);
            return;
        }

        const canvas = wrapped.canvas;
        const bytes = Math.max(
            1,
            Math.round(canvas.width * canvas.height * CANVAS_BYTES_PER_PIXEL),
        );

        this.frames.set(index, {
            frame: {
                source: canvas,
                timestamp: wrapped.timestamp,
                duration: wrapped.duration,
            },
            index,
            bytes,
        });
        this.cachedBytes += bytes;
        this.evict();
    }

    /** Cache read with no profiling side effects, for internal callers. */
    private lookupFrame(timeSec: number): CachedFrame | null {
        const metadata = this.metadata;

        if (
            this.disposed ||
            !metadata?.canDecode ||
            !Number.isFinite(timeSec)
        ) {
            return null;
        }

        const clamped = this.clampTime(timeSec);
        const index = this.frameIndex(clamped);
        const exact = this.frames.get(index);

        if (exact) {
            return this.touchFrame(exact);
        }

        /**
         * A decoded frame starts at or before the requested time, so rounding
         * its own timestamp can land one index below the requested one. The
         * neighbours are only accepted when their span actually covers the
         * requested time, which keeps a wrong frame from being served.
         */
        for (const candidate of [
            this.frames.get(index - 1),
            this.frames.get(index + 1),
        ]) {
            if (candidate && this.covers(candidate.frame, clamped)) {
                return this.touchFrame(candidate);
            }
        }

        return null;
    }

    private touchFrame(frame: CachedFrame): CachedFrame {
        this.frames.delete(frame.index);
        this.frames.set(frame.index, frame);

        return frame;
    }

    /**
     * Bounded by frame count and by approximate decoded bytes, because a 4K
     * frame costs roughly twenty times a 540p one. Insertion order is recency
     * order, so the oldest entry is always first.
     */
    private evict(): void {
        while (
            this.frames.size > 1 &&
            (this.frames.size > mediaLimits.previewFrameCacheCount ||
                this.cachedBytes > mediaLimits.previewFrameCacheBytes)
        ) {
            const oldest = this.frames.values().next().value;

            if (!oldest) {
                return;
            }

            this.frames.delete(oldest.index);
            this.cachedBytes -= oldest.bytes;
        }
    }

    private clearFrames(): void {
        this.frames.clear();
        this.cachedBytes = 0;
    }

    private frameIndex(timeSec: number): number {
        const metadata = this.metadata;
        const fps = metadata?.fps ?? FALLBACK_FPS;

        return Math.round((timeSec - (metadata?.firstTimestampSec ?? 0)) * fps);
    }

    private covers(frame: PreviewFrame, timeSec: number): boolean {
        const fps = this.metadata?.fps ?? FALLBACK_FPS;
        const duration = frame.duration > 0 ? frame.duration : 1 / fps;

        return (
            timeSec >= frame.timestamp - TIMESTAMP_EPSILON &&
            timeSec < frame.timestamp + duration
        );
    }

    private clampTime(timeSec: number): number {
        const metadata = this.metadata;

        if (!metadata) {
            return timeSec;
        }

        const minimum = metadata.firstTimestampSec + TIMESTAMP_EPSILON;
        const maximum =
            metadata.durationSec > 0
                ? Math.max(
                      minimum,
                      metadata.firstTimestampSec +
                          metadata.durationSec -
                          TIMESTAMP_EPSILON,
                  )
                : Math.max(minimum, timeSec);

        return Math.min(Math.max(timeSec, minimum), maximum);
    }
}

/** Comparable identity for a decode size; `'source'` means no downscale. */
function sizeKey(size: PreviewDecodeSize | null): string {
    return size ? `${size.width}x${size.height}` : 'source';
}

const providers = new Map<string, MediaProviderImpl>();

/**
 * Returns the shared provider for `url`, creating it on first use. Every call
 * must be paired with exactly one `release()`; the underlying `Input` and its
 * decoders are torn down only once the last holder lets go.
 */
export function acquireMediaProvider(url: string): MediaProvider {
    const existing = providers.get(url);

    if (existing) {
        existing.retain();

        return existing;
    }

    const provider = new MediaProviderImpl(url);
    providers.set(url, provider);

    return provider;
}

/** Tears every provider down regardless of refcount; for editor teardown. */
export function releaseAllMediaProviders(): void {
    for (const provider of [...providers.values()]) {
        while (provider.refCount > 0) {
            provider.release();
        }
    }

    providers.clear();
    activePreviews.length = 0;
}
