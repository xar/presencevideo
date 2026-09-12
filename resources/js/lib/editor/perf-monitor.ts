/**
 * Dev-only playback profiler. While the timeline plays it samples rAF frame
 * gaps and long main-thread tasks; alongside that it counts what the DECODE
 * pipeline is doing, because a perfectly smooth 60fps compositor still looks
 * laggy if the picture it is compositing is stale. Both are logged as compact
 * summary lines every two seconds via console.warn — which the Laravel Boost
 * browser-log hook captures, so the numbers can be read back without opening
 * devtools.
 *
 * Costs nothing in production builds: the caller gates on import.meta.env.DEV,
 * and every counter below is a no-op until `startPlaybackPerfMonitor` runs.
 */

/**
 * Resolved lazily so this module stays importable from the headless decode
 * layer. `media-provider.ts` must not pull the timeline store into its graph.
 */
let timeline: { isPlaying: boolean } = { isPlaying: false };

type WindowStats = {
    frames: number;
    worstGapMs: number;
    over25ms: number;
    over50ms: number;
    longTasks: number;
    longTaskTotalMs: number;
    worstLongTaskMs: number;
};

const freshStats = (): WindowStats => ({
    frames: 0,
    worstGapMs: 0,
    over25ms: 0,
    over50ms: 0,
    longTasks: 0,
    longTaskTotalMs: 0,
    worstLongTaskMs: 0,
});

/* ------------------------------------------------------------------ */
/* decode counters                                                     */
/* ------------------------------------------------------------------ */

export type DecodeCounters = {
    /** Synchronous cache reads that found the frame. */
    hits: number;
    /** Synchronous cache reads that did not. */
    misses: number;
    /** Misses taken WHILE PLAYING — i.e. the picture actually went stale. */
    starvations: number;
    /** Frames that arrived from the decoder. */
    decoded: number;
    /** Read-ahead timestamps handed to the decoder before they were needed. */
    prefetched: number;
    /** Completed request -> frame-available measurements. */
    latencySamples: number;
    latencyTotalMs: number;
    worstLatencyMs: number;
};

const freshDecodeCounters = (): DecodeCounters => ({
    hits: 0,
    misses: 0,
    starvations: 0,
    decoded: 0,
    prefetched: 0,
    latencySamples: 0,
    latencyTotalMs: 0,
    worstLatencyMs: 0,
});

let decodeCounters = freshDecodeCounters();

/**
 * Gated exactly like the rAF sampler: nothing is counted, and no request
 * timestamps are retained, unless the monitor is running.
 */
let counting = false;

/** Request start times, keyed by the provider's own frame key. */
const pendingRequests = new Map<string, number>();

/** Bounds the map if a provider is torn down mid-decode and never completes. */
const MAX_PENDING_REQUESTS = 256;

const now = (): number =>
    typeof performance === 'undefined' ? Date.now() : performance.now();

/** Snapshot of the counters since the last two-second report, for tests. */
export function readDecodeCounters(): DecodeCounters {
    return { ...decodeCounters };
}

/** Test seam; the monitor itself resets on every report. */
export function resetDecodeCounters(): void {
    decodeCounters = freshDecodeCounters();
    pendingRequests.clear();
}

/** Test seam, and how the monitor arms and disarms the counters. */
export function setDecodeCountingEnabled(enabled: boolean): void {
    counting = enabled;

    if (!enabled) {
        pendingRequests.clear();
    }
}

export function recordCacheHit(): void {
    if (!counting) return;
    decodeCounters.hits++;
}

/**
 * A miss is normal and transient while scrubbing. A miss WHILE PLAYING is the
 * thing the user perceives as lag, so it is counted separately.
 */
export function recordCacheMiss(whilePlaying: boolean): void {
    if (!counting) return;
    decodeCounters.misses++;
    if (whilePlaying) decodeCounters.starvations++;
}

/** Called when a timestamp is handed to the decoder. */
export function recordDecodeRequest(key: string, prefetched: boolean): void {
    if (!counting) return;
    if (prefetched) decodeCounters.prefetched++;

    if (pendingRequests.has(key)) return;
    if (pendingRequests.size >= MAX_PENDING_REQUESTS) pendingRequests.clear();

    pendingRequests.set(key, now());
}

/** Called when the decoded frame lands in the cache and is servable. */
export function recordDecodeComplete(key: string): void {
    if (!counting) return;
    decodeCounters.decoded++;

    const startedAt = pendingRequests.get(key);
    if (startedAt === undefined) return;

    pendingRequests.delete(key);
    const latency = now() - startedAt;
    decodeCounters.latencySamples++;
    decodeCounters.latencyTotalMs += latency;
    decodeCounters.worstLatencyMs = Math.max(
        decodeCounters.worstLatencyMs,
        latency,
    );
}

function decodeReport(windowSec: number): string | null {
    const counters = decodeCounters;
    const reads = counters.hits + counters.misses;

    if (reads === 0 && counters.decoded === 0) {
        return null;
    }

    const hitRate = reads > 0 ? (counters.hits / reads) * 100 : 0;
    const meanLatency =
        counters.latencySamples > 0
            ? counters.latencyTotalMs / counters.latencySamples
            : 0;

    return (
        '[perf] decode ' +
        `hit=${hitRate.toFixed(1)}% (${counters.hits}/${reads}) ` +
        `starved=${counters.starvations} ` +
        `decoded=${counters.decoded} (${(counters.decoded / windowSec).toFixed(1)}/s, prefetched=${counters.prefetched}) ` +
        `latency=${meanLatency.toFixed(0)}ms worst=${counters.worstLatencyMs.toFixed(0)}ms`
    );
}

export function startPlaybackPerfMonitor(): () => void {
    let stats = freshStats();
    let lastTick: number | null = null;
    let lastReport = performance.now();
    let frameId: number | null = null;

    void import('./timeline.svelte')
        .then((module) => {
            timeline = module.timelineStore;
        })
        .catch(() => undefined);

    resetDecodeCounters();
    setDecodeCountingEnabled(true);

    let observer: PerformanceObserver | null = null;
    try {
        observer = new PerformanceObserver((list) => {
            if (!timeline.isPlaying) return;
            for (const entry of list.getEntries()) {
                stats.longTasks++;
                stats.longTaskTotalMs += entry.duration;
                stats.worstLongTaskMs = Math.max(
                    stats.worstLongTaskMs,
                    entry.duration,
                );
            }
        });
        observer.observe({ type: 'longtask', buffered: false });
    } catch {
        observer = null;
    }

    function tick(now: number) {
        frameId = requestAnimationFrame(tick);

        if (timeline.isPlaying) {
            if (lastTick !== null) {
                const gap = now - lastTick;
                stats.frames++;
                stats.worstGapMs = Math.max(stats.worstGapMs, gap);
                if (gap > 25) stats.over25ms++;
                if (gap > 50) stats.over50ms++;
            }
            lastTick = now;
        } else {
            lastTick = null;
        }

        if (now - lastReport < 2000) {
            return;
        }

        const windowSec = (now - lastReport) / 1000;

        if (stats.frames > 0) {
            const fps = stats.frames / windowSec;
            console.warn(
                '[perf] playback ' +
                    `fps=${fps.toFixed(1)} ` +
                    `worstGap=${stats.worstGapMs.toFixed(0)}ms ` +
                    `janky(>25ms)=${stats.over25ms} dropped(>50ms)=${stats.over50ms} ` +
                    `longTasks=${stats.longTasks} (total=${stats.longTaskTotalMs.toFixed(0)}ms worst=${stats.worstLongTaskMs.toFixed(0)}ms)`,
            );
        }

        // Decode is reported even while paused: a slow first paint and a
        // stuttering scrub are both decode problems that happen with the
        // transport stopped.
        const decodeLine = decodeReport(windowSec);
        if (decodeLine !== null) {
            console.warn(decodeLine);
        }

        stats = freshStats();
        resetDecodeCounters();
        lastReport = now;
    }

    frameId = requestAnimationFrame(tick);

    return () => {
        if (frameId !== null) cancelAnimationFrame(frameId);
        observer?.disconnect();
        setDecodeCountingEnabled(false);
    };
}
