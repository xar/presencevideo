import type { VideoSample } from 'mediabunny';
import type { MediaLookup } from './compositor';
import { mediaLimits } from './editor-features';
import type { PreviewDecodeSize } from './editor-features';
import { acquireMediaProvider, toCurrentOriginUrl } from './media-provider';
import type { MediaProvider, PreviewPlaybackMode } from './media-provider';

/**
 * Bridges the async decode layer to the compositor's synchronous `MediaLookup`.
 *
 * The compositor paints inside a rAF callback and must never await, while decode
 * is inherently asynchronous. This adapter absorbs that mismatch: every lookup
 * answers instantly from cache, and a miss quietly schedules the decode so a
 * later frame succeeds. A miss is therefore normal and transient, not an error.
 */

/**
 * The last frame decoded for an asset, replayed when its element outlives its
 * source or when a decode has not landed yet.
 *
 * Holding a reference across ticks is only sound because the provider's preview
 * sink runs WITHOUT a canvas pool: a pooled canvas is recycled round-robin and
 * would be repainted with a completely different frame while this map still
 * pointed at it, silently showing the wrong picture. See
 * `MediaProviderImpl.createPreviewSink`.
 */
type HeldFrame = {
    source: CanvasImageSource;
    /** Source time the held frame was decoded at, for diagnostics. */
    timeSec: number;
};

export type PreviewMediaLookup = MediaLookup & {
    /**
     * Declare the assets the playhead currently needs. Providers for URLs that
     * dropped out are released, so decoders are not held open for clips that
     * have scrolled far away from the playhead.
     */
    sync(urls: Iterable<string>): void;
    /**
     * Tell every provider whether the playhead is running, which is what
     * decides between read-ahead (playing) and coalesced random access
     * (scrubbing).
     */
    setPlaybackMode(mode: PreviewPlaybackMode): void;
    /**
     * Declare the pixel size frames are painted at, so decodes are sized to
     * the screen rather than to the source.
     */
    setPreviewSurface(surface: PreviewDecodeSize | null): void;
    /**
     * Start decoding the first frame each visible asset will need, before the
     * renderer asks for it.
     *
     * Nothing warms itself up otherwise: the first paint of a freshly loaded
     * project waits on container parse, range fetches and a keyframe decode,
     * all of which can start while the editor is still mounting. Bounded by
     * `concurrentPreviewDecoders`, since a warm-up that evicted the decoder it
     * just opened would be worse than none, and skipped for any asset that is
     * already decoding something the user actually asked for.
     */
    warmUp(requests: readonly WarmUpRequest[]): void;
    /** Release every provider and image. Call on editor teardown. */
    dispose(): void;
};

/** One asset to pre-decode, at the first source time it will be shown at. */
export type WarmUpRequest = { url: string; timeSec: number };

/**
 * Create a lookup backed by refcounted media providers and an image cache.
 *
 * `loadImage` is injected so tests can run without a DOM; in the browser it
 * defaults to an `HTMLImageElement` load.
 */
export function createPreviewMediaLookup(
    loadImage: (url: string) => {
        source: CanvasImageSource;
        ready: () => boolean;
    } | null = defaultImageLoader,
): PreviewMediaLookup {
    const providers = new Map<string, MediaProvider>();
    let playbackMode: PreviewPlaybackMode = 'idle';
    let surface: PreviewDecodeSize | null = null;
    const images = new Map<
        string,
        { source: CanvasImageSource; ready: () => boolean } | null
    >();
    const held = new Map<string, HeldFrame>();

    function providerFor(url: string): MediaProvider {
        let provider = providers.get(url);
        if (!provider) {
            provider = acquireMediaProvider(url);
            provider.setPlaybackMode(playbackMode);
            provider.setPreviewSurface(surface);
            providers.set(url, provider);
        }
        return provider;
    }

    return {
        getImage(url: string): CanvasImageSource | null {
            if (!images.has(url)) {
                images.set(url, loadImage(url));
            }

            const entry = images.get(url);
            return entry && entry.ready() ? entry.source : null;
        },

        getVideoFrame(
            url: string,
            timeSec: number | null,
        ): CanvasImageSource | null {
            // A null time means the element outlived its source content, which
            // the render expresses as tpad holding the last frame. Reproduce
            // that by replaying whatever we last decoded for this asset.
            if (timeSec === null) {
                return held.get(url)?.source ?? null;
            }

            const provider = providerFor(url);
            const frame = provider.frameAt(timeSec);

            if (!frame) {
                provider.requestFrame(timeSec);
                // Showing the previous frame beats showing a hole: a decode miss
                // during a fast scrub then reads as a lagging picture rather
                // than as flicker.
                return held.get(url)?.source ?? null;
            }

            held.set(url, { source: frame.source, timeSec });
            return frame.source;
        },

        sync(urls: Iterable<string>): void {
            const wanted = new Set(urls);

            for (const [url, provider] of providers) {
                if (!wanted.has(url)) {
                    provider.release();
                    providers.delete(url);
                    held.delete(url);
                }
            }

            for (const url of wanted) {
                const provider = providerFor(url);
                provider.setPlaybackMode(playbackMode);
                provider.setPreviewSurface(surface);
            }
        },

        setPlaybackMode(mode: PreviewPlaybackMode): void {
            if (mode === playbackMode) {
                return;
            }

            playbackMode = mode;

            for (const provider of providers.values()) {
                provider.setPlaybackMode(mode);
            }
        },

        setPreviewSurface(next: PreviewDecodeSize | null): void {
            surface = next ? { ...next } : null;

            for (const provider of providers.values()) {
                provider.setPreviewSurface(surface);
            }
        },

        warmUp(requests: readonly WarmUpRequest[]): void {
            const seen = new Set<string>();
            let started = 0;

            for (const request of requests) {
                if (started >= mediaLimits.concurrentPreviewDecoders) {
                    return;
                }

                if (
                    seen.has(request.url) ||
                    !Number.isFinite(request.timeSec)
                ) {
                    continue;
                }

                seen.add(request.url);
                const provider = providerFor(request.url);

                // A provider already working on a demanded frame is serving a
                // live scrub; queueing warm-up behind it would only delay it.
                if (provider.isDecodePending) {
                    continue;
                }

                provider.setPlaybackMode(playbackMode);
                provider.setPreviewSurface(surface);
                provider.requestFrame(request.timeSec);
                started++;
            }
        },

        dispose(): void {
            for (const provider of providers.values()) {
                provider.release();
            }
            providers.clear();
            images.clear();
            held.clear();
        },
    };
}

function defaultImageLoader(
    url: string,
): { source: CanvasImageSource; ready: () => boolean } | null {
    if (typeof Image === 'undefined') {
        return null;
    }

    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.src = url;

    return {
        source: image,
        // `complete` alone is true for a failed load too, so the natural size
        // is what actually proves there are pixels to draw.
        ready: () => image.complete && image.naturalWidth > 0,
    };
}

/* ------------------------------------------------------------------ */
/* export                                                              */
/* ------------------------------------------------------------------ */

/** One element's media need for a single exported frame. */
export type ExportMediaRequest = {
    url: string;
    /**
     * Source time in seconds, or null when the element has run past its
     * source and is holding its last frame (the render's `tpad` behaviour).
     */
    timeSec: number | null;
};

export type ExportMediaLookup = MediaLookup & {
    /**
     * Decode everything the next frame needs, then return. The export awaits
     * this BEFORE painting, which is what lets `getImage`/`getVideoFrame` stay
     * synchronous while still never missing: an export that skipped a frame
     * because a decode was in flight would silently drop content.
     */
    prepare(requests: readonly ExportMediaRequest[]): Promise<void>;
    /**
     * URLs whose media could not be decoded at all. Collected rather than
     * thrown: one broken asset must not cost the user the whole export, but
     * the caller has to be able to say so honestly.
     */
    readonly undecodable: ReadonlySet<string>;
    /** Close every decoder and sample. Always call this, including on failure. */
    dispose(): Promise<void>;
};

/** Async image load for the export, where waiting is allowed and correct. */
export type ExportImageLoader = (
    url: string,
) => Promise<CanvasImageSource | null>;

/**
 * A single forward-only decode cursor over one source.
 *
 * `openSequential` hands back mediabunny's pre-decode-ahead pipeline, which is
 * dramatically cheaper than seeking per frame but only works if it is consumed
 * monotonically. One lane therefore owns one generator and the single sample it
 * is currently parked on.
 */
type ExportLane = {
    provider: MediaProvider;
    samples: AsyncGenerator<VideoSample, void, unknown> | null;
    /** The sample the lane is parked on; open, and owned by the lane. */
    sample: VideoSample | null;
    /** Source time the lane was last advanced to; advancing is monotonic. */
    lastSec: number;
    /** Last source time this media can serve; never decode past it. */
    maxSec: number;
    fallbackFrameSec: number;
    ended: boolean;
};

/** Matches the provider's own boundary epsilon so the two agree on clamping. */
const EXPORT_EPSILON = 0.001;

/**
 * Create the EXPORT counterpart of {@link createPreviewMediaLookup}.
 *
 * The preview adapter is built for random access: it seeks, caches, and
 * tolerates misses because a dropped preview frame is invisible. An export has
 * the opposite shape — a strictly monotonic clock, no tolerance for a missing
 * frame, and thousands of frames to get through — so it uses
 * `MediaProvider.openSequential`, which decodes ahead and is deliberately
 * separate from the preview's decoder and LRU. Running an export therefore
 * never evicts the frames the editor is showing, and never competes for the
 * capped preview decoder slots.
 *
 * Sample ownership is explicit here: a lane closes the sample it is parked on
 * only once its replacement has arrived. Leaking samples exhausts the decoder
 * pool and stalls decode with no error at all, and closing one too early loses
 * the held last frame; `close()` is idempotent, so the provider's own
 * book-keeping on top of this is a harmless no-op.
 */
export function createExportMediaLookup(
    loadImage: ExportImageLoader = defaultExportImageLoader,
): ExportMediaLookup {
    const lanes = new Map<string, ExportLane[]>();
    const images = new Map<string, CanvasImageSource | null>();
    const undecodable = new Set<string>();
    /** Sources resolved for the frame currently being painted, keyed url|time. */
    const frameSources = new Map<string, CanvasImageSource>();
    /** Last resolved source per url, for elements holding their final frame. */
    const held = new Map<string, CanvasImageSource>();

    function sourceKey(url: string, timeSec: number): string {
        return `${url}|${timeSec}`;
    }

    async function laneFor(
        url: string,
        index: number,
        timeSec: number,
    ): Promise<ExportLane | null> {
        let list = lanes.get(url);
        if (!list) {
            list = [];
            lanes.set(url, list);
        }

        const existing = list[index];
        if (existing) {
            return existing;
        }

        const provider = acquireMediaProvider(url);
        const readiness = await provider.ready();

        if (!readiness.canDecode) {
            undecodable.add(url);
            provider.release();

            return null;
        }

        const lane: ExportLane = {
            provider,
            samples: null,
            sample: null,
            lastSec: Number.NEGATIVE_INFINITY,
            maxSec:
                readiness.durationSec > 0
                    ? readiness.firstTimestampSec +
                      readiness.durationSec -
                      EXPORT_EPSILON
                    : Number.POSITIVE_INFINITY,
            fallbackFrameSec: 1 / Math.max(1, readiness.fps),
            ended: false,
        };

        list[index] = lane;
        await openLane(lane, timeSec);

        return lane;
    }

    async function openLane(lane: ExportLane, fromSec: number): Promise<void> {
        await closeLaneStream(lane);
        lane.samples = lane.provider.openSequential(
            Math.max(0, fromSec),
            Number.POSITIVE_INFINITY,
        );
        lane.ended = false;
    }

    async function closeLaneStream(lane: ExportLane): Promise<void> {
        lane.sample?.close();
        lane.sample = null;

        const samples = lane.samples;
        lane.samples = null;

        if (samples) {
            await samples.return?.(undefined).catch(() => undefined);
        }
    }

    function covers(lane: ExportLane, timeSec: number): boolean {
        const sample = lane.sample;
        if (!sample) {
            return false;
        }

        const duration =
            sample.duration > 0 ? sample.duration : lane.fallbackFrameSec;

        return timeSec < sample.timestamp + duration;
    }

    /**
     * Walk the lane forward until its sample covers `timeSec`.
     *
     * Never decodes past the end of the media: the last sample is left open so
     * an element that outlives its source keeps holding a real final frame
     * rather than dropping to nothing.
     */
    async function advance(lane: ExportLane, timeSec: number): Promise<void> {
        // A backwards request cannot be served by a forward-only pipeline. It
        // happens legitimately when the same asset is reused later at an
        // earlier offset, so reopen rather than refuse.
        if (timeSec < lane.lastSec - EXPORT_EPSILON) {
            await openLane(lane, timeSec);
        }

        lane.lastSec = timeSec;
        const target = Math.min(timeSec, lane.maxSec);

        while (!lane.ended && lane.samples && !covers(lane, target)) {
            const next = await lane.samples.next();

            if (next.done) {
                lane.ended = true;
                break;
            }

            // The replacement is in hand, so the sample we just walked past can
            // go back to the decoder pool.
            lane.sample?.close();
            lane.sample = next.value;
        }
    }

    async function prepareVideo(
        requests: readonly ExportMediaRequest[],
    ): Promise<void> {
        const byUrl = new Map<string, number[]>();

        for (const request of requests) {
            if (request.timeSec === null || !Number.isFinite(request.timeSec)) {
                continue;
            }

            const times = byUrl.get(request.url) ?? [];
            if (!times.includes(request.timeSec)) {
                times.push(request.timeSec);
            }
            byUrl.set(request.url, times);
        }

        for (const [url, times] of byUrl) {
            if (undecodable.has(url)) {
                continue;
            }

            // One lane per distinct source time on the same asset, assigned in
            // ascending time order so each lane keeps seeing a monotonic clock
            // even when a project shows one video twice at different offsets.
            times.sort((a, b) => a - b);

            for (let index = 0; index < times.length; index++) {
                const timeSec = times[index];
                const lane = await laneFor(url, index, timeSec);

                if (!lane) {
                    break;
                }

                await advance(lane, timeSec);

                if (lane.sample) {
                    const source = lane.sample.toCanvasImageSource();
                    frameSources.set(sourceKey(url, timeSec), source);
                    held.set(url, source);
                }
            }
        }
    }

    async function prepareImages(
        requests: readonly ExportMediaRequest[],
    ): Promise<void> {
        const pending: Promise<void>[] = [];

        for (const request of requests) {
            if (request.timeSec !== null || images.has(request.url)) {
                continue;
            }

            images.set(request.url, null);
            pending.push(
                loadImage(request.url)
                    .then((image) => {
                        images.set(request.url, image);

                        if (!image) {
                            undecodable.add(request.url);
                        }
                    })
                    .catch(() => {
                        undecodable.add(request.url);
                    }),
            );
        }

        await Promise.all(pending);
    }

    return {
        get undecodable(): ReadonlySet<string> {
            return undecodable;
        },

        async prepare(requests: readonly ExportMediaRequest[]): Promise<void> {
            frameSources.clear();
            await prepareImages(requests);
            await prepareVideo(requests);
        },

        getImage(url: string): CanvasImageSource | null {
            return images.get(url) ?? null;
        },

        getVideoFrame(
            url: string,
            timeSec: number | null,
        ): CanvasImageSource | null {
            if (timeSec === null) {
                return held.get(url) ?? null;
            }

            return frameSources.get(sourceKey(url, timeSec)) ?? null;
        },

        async dispose(): Promise<void> {
            for (const list of lanes.values()) {
                for (const lane of list) {
                    if (!lane) {
                        continue;
                    }

                    await closeLaneStream(lane);
                    lane.provider.release();
                }
            }

            lanes.clear();
            frameSources.clear();
            held.clear();
            images.clear();
        },
    };
}

/**
 * Fetches through the session so asset routes behind the auth guard resolve,
 * and decodes to an `ImageBitmap`, which is the only image source that works
 * off the main thread.
 */
async function defaultExportImageLoader(
    url: string,
): Promise<CanvasImageSource | null> {
    try {
        const response = await fetch(toCurrentOriginUrl(url), {
            credentials: 'include',
        });

        if (!response.ok) {
            return null;
        }

        return await createImageBitmap(await response.blob());
    } catch {
        return null;
    }
}
