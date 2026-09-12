import type { VideoSample, WrappedAudioBuffer } from 'mediabunny';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { editorFeatures, mediaLimits } from '../editor-features';
import {
    readDecodeCounters,
    resetDecodeCounters,
    setDecodeCountingEnabled,
} from '../perf-monitor';
import {
    acquireMediaProvider,
    releaseAllMediaProviders,
} from '../media-provider';
import type { MediaProvider } from '../media-provider';

/**
 * mediabunny cannot decode in jsdom, so the whole package is faked. The fake
 * models the behaviours the provider depends on: a timestamp query returns the
 * last frame starting at or before it (so decoded timestamps snap DOWN to the
 * frame grid), `VideoSampleSink` never closes the samples it hands out, and
 * `CanvasSink` offers the two access shapes the provider uses — `getCanvas`
 * for the frame the renderer is waiting on, and `canvases` for the forward
 * read-ahead run.
 */
const harness = vi.hoisted(() => {
    type Gate = { promise: Promise<void>; open: () => void };

    function createGate(startOpen: boolean): Gate {
        let open = () => {};
        const promise = startOpen
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                  open = resolve;
              });

        return { promise, open };
    }

    type FakeWrappedCanvas = {
        canvas: { width: number; height: number };
        timestamp: number;
        duration: number;
    };

    class FakeVideoSample {
        closeCount = 0;

        constructor(
            readonly timestamp: number,
            readonly duration: number,
            readonly codedWidth: number,
            readonly codedHeight: number,
        ) {}

        close(): void {
            this.closeCount++;
        }
    }

    const state = {
        canRead: true,
        hasVideo: true,
        hasAudio: false,
        canDecode: true,
        firstTimestamp: 0,
        duration: 10,
        fps: 30,
        width: 1920,
        height: 1080,
        inputsCreated: 0,
        disposeCalls: 0,
        videoSinksCreated: 0,
        canvasSinksCreated: 0,
        canvasSinkOptions: [] as Array<Record<string, unknown> | undefined>,
        previewGeneratorsOpened: 0,
        previewGeneratorsClosed: 0,
        streamStarts: [] as Array<number | undefined>,
        streamedTimestamps: [] as number[],
        onStreamFrame: null as null | (() => void),
        onDemandDecode: null as null | (() => Promise<void> | void),
        requestedTimestamps: [] as number[],
        sequentialRanges: [] as Array<[number | undefined, number | undefined]>,
        samples: [] as FakeVideoSample[],
        canvases: [] as FakeWrappedCanvas[],
        /** How many timestamps the fake sink pulls before emitting, as mediabunny does. */
        sinkQueueDepth: 8,
        gate: createGate(true),
        outputGate: createGate(true),
    };

    function snap(timestamp: number): number {
        const frames = Math.floor(
            (timestamp - state.firstTimestamp) * state.fps + 1e-6,
        );

        return state.firstTimestamp + frames / state.fps;
    }

    function makeCanvas(
        timestamp: number,
        options: Record<string, unknown> | undefined,
    ): FakeWrappedCanvas {
        const width = (options?.width as number) ?? state.width;
        const height = (options?.height as number) ?? state.height;
        // Every emitted canvas is a DISTINCT object: the preview sink runs with
        // no pool, so nothing is ever recycled under a cached or held frame.
        const wrapped = {
            canvas: { width, height },
            timestamp,
            duration: 1 / state.fps,
        };
        state.canvases.push(wrapped);

        return wrapped;
    }

    function makeSample(timestamp: number): FakeVideoSample {
        const sample = new FakeVideoSample(
            timestamp,
            1 / state.fps,
            state.width,
            state.height,
        );
        state.samples.push(sample);

        return sample;
    }

    const videoTrack = {
        canDecode: async () => state.canDecode,
        computePacketStats: async () => ({
            packetCount: 300,
            averagePacketRate: state.fps,
            averageBitrate: 1_000_000,
        }),
        computeDuration: async () => state.duration,
        getFirstTimestamp: async () => state.firstTimestamp,
        getDisplayWidth: async () => state.width,
        getDisplayHeight: async () => state.height,
    };

    const audioTrack = { canDecode: async () => true };

    class FakeUrlSource {
        constructor(
            readonly url: string,
            readonly options?: unknown,
        ) {}
    }

    class FakeInput {
        constructor(readonly options: unknown) {
            state.inputsCreated++;
        }

        async canRead(): Promise<boolean> {
            return state.canRead;
        }

        async getPrimaryVideoTrack(): Promise<unknown> {
            return state.hasVideo ? videoTrack : null;
        }

        async getPrimaryAudioTrack(): Promise<unknown> {
            return state.hasAudio ? audioTrack : null;
        }

        dispose(): void {
            state.disposeCalls++;
        }
    }

    class FakeCanvasSink {
        constructor(
            readonly track: unknown,
            readonly options?: Record<string, unknown>,
        ) {
            state.canvasSinksCreated++;
            state.canvasSinkOptions.push(options);
        }

        /** Self-contained decode: seeks, decodes and flushes on its own. */
        async getCanvas(timestamp: number): Promise<FakeWrappedCanvas | null> {
            state.requestedTimestamps.push(timestamp);
            await state.gate.promise;
            // Lets a test model the render loop missing AGAIN while this
            // decode is still in flight, which is what a playhead that has
            // fallen behind actually does.
            await state.onDemandDecode?.();

            return makeCanvas(snap(timestamp), this.options);
        }

        /** Forward run: one decoder, emitting frames continuously. */
        async *canvases(
            start?: number,
        ): AsyncGenerator<FakeWrappedCanvas, void, unknown> {
            state.previewGeneratorsOpened++;
            state.streamStarts.push(start);

            try {
                await state.gate.promise;
                let timestamp = snap(start ?? state.firstTimestamp);
                const last = state.firstTimestamp + state.duration;

                while (timestamp < last) {
                    await state.outputGate.promise;
                    state.onStreamFrame?.();
                    state.streamedTimestamps.push(timestamp);
                    yield makeCanvas(timestamp, this.options);
                    timestamp += 1 / state.fps;
                }
            } finally {
                state.previewGeneratorsClosed++;
            }
        }
    }

    class FakeVideoSampleSink {
        constructor(readonly track: unknown) {
            state.videoSinksCreated++;
        }

        async *samples(
            start?: number,
            end?: number,
        ): AsyncGenerator<FakeVideoSample, void, unknown> {
            state.sequentialRanges.push([start, end]);
            const from = snap(start ?? state.firstTimestamp);
            const to = end ?? state.firstTimestamp + state.duration;

            for (let frame = 0; ; frame++) {
                const timestamp = from + frame / state.fps;

                if (timestamp >= to - 1e-9) {
                    return;
                }

                yield makeSample(timestamp);
            }
        }
    }

    class FakeAudioBufferSink {
        constructor(readonly track: unknown) {}

        async *buffers(
            start: number,
            end: number,
        ): AsyncGenerator<
            { buffer: unknown; timestamp: number; duration: number },
            void,
            unknown
        > {
            for (let timestamp = start; timestamp < end; timestamp += 0.5) {
                yield { buffer: {}, timestamp, duration: 0.5 };
            }
        }
    }

    return {
        state,
        createGate,
        snap,
        FakeVideoSample,
        module: {
            ALL_FORMATS: [],
            UrlSource: FakeUrlSource,
            Input: FakeInput,
            VideoSampleSink: FakeVideoSampleSink,
            CanvasSink: FakeCanvasSink,
            AudioBufferSink: FakeAudioBufferSink,
        },
    };
});

vi.mock('mediabunny', () => harness.module);

const state = harness.state;
const limits = { ...mediaLimits };

/** The fake samples count their own `close()` calls; the real type cannot. */
function closeCount(sample: VideoSample | null): number {
    return (sample as unknown as { closeCount: number }).closeCount;
}

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
    for (let attempt = 0; attempt < 200; attempt++) {
        if (predicate()) {
            return;
        }

        await new Promise((resolve) => setTimeout(resolve, 0));
    }

    throw new Error(`Timed out waiting for ${label}.`);
}

async function settle(): Promise<void> {
    for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

/** Requests a frame and waits until it is decodable from the cache. */
async function decode(provider: MediaProvider, timeSec: number): Promise<void> {
    provider.requestFrame(timeSec);
    await waitFor(
        () => provider.frameAt(timeSec) !== null,
        `frame at ${timeSec}`,
    );
}

describe('media-provider', () => {
    beforeEach(() => {
        Object.assign(state, {
            canRead: true,
            hasVideo: true,
            hasAudio: false,
            canDecode: true,
            firstTimestamp: 0,
            duration: 10,
            fps: 30,
            width: 1920,
            height: 1080,
            inputsCreated: 0,
            disposeCalls: 0,
            videoSinksCreated: 0,
            canvasSinksCreated: 0,
            canvasSinkOptions: [],
            previewGeneratorsOpened: 0,
            previewGeneratorsClosed: 0,
            streamStarts: [],
            streamedTimestamps: [],
            onStreamFrame: null,
            onDemandDecode: null,
            requestedTimestamps: [],
            sequentialRanges: [],
            samples: [],
            canvases: [],
            sinkQueueDepth: 8,
            gate: harness.createGate(true),
            outputGate: harness.createGate(true),
        });
        Object.assign(mediaLimits, limits);
        editorFeatures.frameAccurateDecode = true;
    });

    afterEach(() => {
        releaseAllMediaProviders();
        Object.assign(mediaLimits, limits);
    });

    describe('refcounting', () => {
        it('shares one instance per url and disposes exactly once', async () => {
            const first = acquireMediaProvider('/a.mp4');
            const second = acquireMediaProvider('/a.mp4');

            expect(second).toBe(first);
            expect(first.refCount).toBe(2);
            await first.ready();
            expect(state.inputsCreated).toBe(1);

            first.release();
            expect(acquireMediaProvider('/a.mp4')).toBe(first);
            expect(state.disposeCalls).toBe(0);

            first.release();
            first.release();
            expect(state.disposeCalls).toBe(1);

            first.release();
            expect(state.disposeCalls).toBe(1);
        });

        it('builds a fresh instance after the last reference is gone', async () => {
            const first = acquireMediaProvider('/a.mp4');
            await first.ready();
            first.release();

            const second = acquireMediaProvider('/a.mp4');
            expect(second).not.toBe(first);

            await second.ready();
            expect(state.inputsCreated).toBe(2);
        });

        it('keeps distinct urls on distinct providers', () => {
            expect(acquireMediaProvider('/a.mp4')).not.toBe(
                acquireMediaProvider('/b.mp4'),
            );
        });
    });

    describe('ready()', () => {
        it('resolves metadata once and reads fps from packet stats', async () => {
            state.fps = 24;
            state.firstTimestamp = 0.5;
            const provider = acquireMediaProvider('/a.mp4');

            const metadata = await provider.ready();
            await provider.ready();

            expect(metadata).toEqual({
                canDecode: true,
                fps: 24,
                durationSec: 10,
                firstTimestampSec: 0.5,
                displayWidth: 1920,
                displayHeight: 1080,
                hasAudio: false,
            });
            expect(state.inputsCreated).toBe(1);
        });

        it('reports audio availability', async () => {
            state.hasAudio = true;
            const provider = acquireMediaProvider('/a.mp4');

            expect((await provider.ready()).hasAudio).toBe(true);
            expect(provider.hasAudio).toBe(true);
        });

        it.each([
            ['no video track', () => (state.hasVideo = false)],
            ['an undecodable codec', () => (state.canDecode = false)],
            ['an unreadable source', () => (state.canRead = false)],
        ])('resolves cleanly for %s', async (_label, configure) => {
            configure();
            const provider = acquireMediaProvider('/a.mp4');

            const metadata = await provider.ready();
            expect(metadata.canDecode).toBe(false);

            provider.requestFrame(1);
            await settle();

            expect(provider.frameAt(1)).toBeNull();
            expect(state.previewGeneratorsOpened).toBe(0);
        });
    });

    describe('preview frames', () => {
        it('serves a decoded frame synchronously and clamps to the track start', async () => {
            state.firstTimestamp = 10;
            const provider = acquireMediaProvider('/a.mp4');
            await provider.ready();

            await decode(provider, 0);

            expect(state.requestedTimestamps).toEqual([10.001]);
            expect(provider.frameAt(0)).not.toBeNull();
        });

        it('clamps to just inside the track end', async () => {
            state.firstTimestamp = 10;
            state.duration = 5;
            const provider = acquireMediaProvider('/a.mp4');
            await provider.ready();

            provider.requestFrame(999);
            await waitFor(
                () => state.requestedTimestamps.length === 1,
                'a clamped request',
            );

            expect(state.requestedTimestamps[0]).toBeCloseTo(14.999, 5);
        });

        it('hits the cache without decoding again', async () => {
            const provider = acquireMediaProvider('/a.mp4');
            await decode(provider, 1);

            const frame = provider.frameAt(1);
            provider.requestFrame(1);
            await settle();

            expect(provider.frameAt(1)).toBe(frame);
            expect(state.canvases).toHaveLength(1);
        });

        it('serves a frame whose span covers a sub-frame timestamp', async () => {
            const provider = acquireMediaProvider('/a.mp4');
            await provider.ready();
            await decode(provider, 1);

            const sample = provider.frameAt(1.02);

            expect(sample?.timestamp).toBe(1);
        });

        it('returns null rather than a frame from another index', async () => {
            const provider = acquireMediaProvider('/a.mp4');
            await decode(provider, 1);

            expect(provider.frameAt(5)).toBeNull();
            expect(provider.frameAt(0.5)).toBeNull();
        });

        it('never throws for absurd inputs or before metadata resolves', () => {
            const provider = acquireMediaProvider('/a.mp4');

            expect(provider.frameAt(0)).toBeNull();
            expect(provider.frameAt(Number.NaN)).toBeNull();
            expect(provider.frameAt(Number.POSITIVE_INFINITY)).toBeNull();
            expect(() => provider.requestFrame(Number.NaN)).not.toThrow();
        });

        it('coalesces pending requests down to the newest timestamp', async () => {
            state.gate = harness.createGate(false);
            const provider = acquireMediaProvider('/a.mp4');
            await provider.ready();

            provider.requestFrame(1);
            provider.requestFrame(2);
            provider.requestFrame(3);
            await settle();

            expect(state.requestedTimestamps).toEqual([1]);

            state.gate.open();
            await waitFor(
                () => state.requestedTimestamps.length > 1,
                'the coalesced decode',
            );
            await settle();

            // The first demand was already in the decoder and cannot be
            // recalled; 2 is dropped in favour of where the pointer landed.
            expect(state.requestedTimestamps).toEqual([1, 3]);
            expect(provider.frameAt(3)).not.toBeNull();
        });

        it('is inert while the feature flag is off', async () => {
            editorFeatures.frameAccurateDecode = false;
            const provider = acquireMediaProvider('/a.mp4');
            await provider.ready();

            provider.requestFrame(1);
            await settle();

            expect(state.canvasSinksCreated).toBe(0);
            expect(provider.frameAt(1)).toBeNull();
        });
    });

    describe('read-ahead', () => {
        it('decodes a monotonic run ahead of the playhead while playing', async () => {
            const provider = acquireMediaProvider('/a.mp4');
            await provider.ready();
            provider.setPlaybackMode('playing');

            await decode(provider, 1);
            // 500ms of read-ahead at 30fps is fifteen frames.
            await waitFor(
                () => state.streamedTimestamps.length >= 15,
                'the read-ahead run',
            );
            await settle();

            const streamed = state.streamedTimestamps;

            for (let index = 1; index < streamed.length; index++) {
                expect(streamed[index]).toBeGreaterThan(streamed[index - 1]);
            }

            // One forward decode run, not a seek per frame.
            expect(state.previewGeneratorsOpened).toBe(1);
            // Which is the point: the playhead's next half second is already
            // decoded before it gets there.
            expect(provider.frameAt(1.2)).not.toBeNull();
            expect(provider.frameAt(1.4)).not.toBeNull();
        });

        it('reads ahead only as far as the configured horizon', async () => {
            const provider = acquireMediaProvider('/a.mp4');
            await provider.ready();
            provider.setPlaybackMode('playing');

            await decode(provider, 1);
            await settle();
            await settle();

            // Bounded work: half a second of frames, not the whole clip.
            expect(state.streamedTimestamps.length).toBeLessThanOrEqual(17);
            expect(provider.frameAt(3)).toBeNull();
        });

        it('opens no read-ahead run while scrubbing', async () => {
            const provider = acquireMediaProvider('/a.mp4');
            await provider.ready();
            provider.setPlaybackMode('playing');
            provider.setPlaybackMode('idle');

            await decode(provider, 1);
            await settle();

            expect(state.requestedTimestamps).toEqual([1]);
            expect(state.streamedTimestamps).toEqual([]);
            expect(state.previewGeneratorsOpened).toBe(0);
        });

        it('lets a scrub interrupt a read-ahead run instead of queueing behind it', async () => {
            // A horizon far longer than the pump could ever finish in one turn.
            mediaLimits.previewPrefetchAheadMs = 5000;
            const provider = acquireMediaProvider('/a.mp4');
            await provider.ready();
            provider.setPlaybackMode('playing');

            let interrupted = false;
            state.onStreamFrame = () => {
                if (interrupted) return;
                interrupted = true;
                // The user grabs the playhead mid-run.
                provider.setPlaybackMode('idle');
                provider.requestFrame(8);
            };

            provider.requestFrame(1);
            await waitFor(
                () => state.requestedTimestamps.includes(8),
                'the scrub to reach the decoder',
            );
            await settle();

            // The 150-frame run was abandoned almost immediately.
            expect(state.streamedTimestamps.length).toBeLessThan(10);
            expect(provider.frameAt(8)).not.toBeNull();
        });

        it('re-targets the read-ahead run when the playhead jumps', async () => {
            const provider = acquireMediaProvider('/a.mp4');
            await provider.ready();
            provider.setPlaybackMode('playing');

            await decode(provider, 1);
            await decode(provider, 6);
            await settle();

            expect(state.streamStarts).toHaveLength(2);
            expect(state.streamStarts[0]).toBeCloseTo(1, 5);
            expect(state.streamStarts[1]).toBeCloseTo(6, 5);
        });
    });

    describe('sustained playback', () => {
        /**
         * Drives the provider exactly the way `createPreviewMediaLookup` drives
         * it from the render loop: a cache read every frame, a decode request
         * only on a miss, and a playhead report either way.
         */
        async function play(
            provider: MediaProvider,
            fromSec: number,
            frames: number,
        ): Promise<{ hits: number; misses: number }> {
            let hits = 0;
            let misses = 0;

            for (let frame = 0; frame < frames; frame++) {
                const timeSec = fromSec + frame / state.fps;

                if (provider.frameAt(timeSec)) {
                    hits++;
                    provider.setPlayhead(timeSec);
                } else {
                    misses++;
                    provider.requestFrame(timeSec);
                }

                await settle();
            }

            return { hits, misses };
        }

        it('keeps the read-ahead run alive for the whole scene', async () => {
            const provider = acquireMediaProvider('/a.mp4');
            await provider.ready();
            provider.setPlaybackMode('playing');

            const { hits, misses } = await play(provider, 1, 150);

            // The run must still be producing at the END of the scene, not
            // only for the first half second after the first miss.
            expect(state.streamedTimestamps.length).toBeGreaterThan(120);
            expect(state.streamedTimestamps.at(-1)).toBeGreaterThan(5);
            expect(hits / (hits + misses)).toBeGreaterThan(0.8);
        });

        it('advances the read-ahead horizon on cache hits, not only on misses', async () => {
            const provider = acquireMediaProvider('/a.mp4');
            await provider.ready();
            provider.setPlaybackMode('playing');

            await decode(provider, 1);
            await settle();
            const afterFirstHorizon = state.streamedTimestamps.length;
            expect(afterFirstHorizon).toBeGreaterThan(0);

            // Nothing misses here; the playhead report is the only signal.
            provider.setPlayhead(1.4);
            await settle();

            expect(state.streamedTimestamps.length).toBeGreaterThan(
                afterFirstHorizon,
            );
        });

        it('keeps read-ahead progressing even while the demand lane never goes idle', async () => {
            // A cache this small makes every lookup miss.
            mediaLimits.previewFrameCacheCount = 1;
            const provider = acquireMediaProvider('/a.mp4');
            await provider.ready();
            provider.setPlaybackMode('playing');

            /**
             * Each demand decode produces the next miss before it finishes, so
             * a demand is pending every single time the pump looks. That is the
             * self-sustaining state a fallen-behind playhead gets into: without
             * guaranteed forward progress the run is never pulled again, so
             * every frame keeps missing, and it only ends at the next scene.
             */
            let next = 1;
            let streamedDuringBurst = 0;
            state.onDemandDecode = async () => {
                next += 1 / state.fps;

                if (next >= 4) {
                    streamedDuringBurst = state.streamedTimestamps.length;
                    return;
                }

                provider.requestFrame(next);

                // Let the (async) schedule land before the decode resolves.
                for (let tick = 0; tick < 5; tick++) {
                    await Promise.resolve();
                }
            };

            provider.requestFrame(next);
            await waitFor(() => next >= 4, 'the demand burst');
            await settle();

            // Measured while the burst was still running, not after it ended:
            // the run has to make progress DURING the starvation, or it never
            // gets the chance to end it.
            expect(streamedDuringBurst).toBeGreaterThan(10);
        });

        it('stops rebuilding a read-ahead run once the source has run out', async () => {
            state.duration = 2;
            const provider = acquireMediaProvider('/a.mp4');
            await provider.ready();
            provider.setPlaybackMode('playing');

            // Play out the tail, where there is nothing left to read ahead to.
            for (let frame = 0; frame < 20; frame++) {
                const timeSec = 1.9 + frame / state.fps;

                if (provider.frameAt(timeSec)) {
                    provider.setPlayhead(timeSec);
                } else {
                    provider.requestFrame(timeSec);
                }

                await settle();
            }

            // One run discovers the end; the rest of the tail must not each
            // build a decoder that immediately ends.
            expect(state.streamStarts.length).toBeLessThanOrEqual(2);
        });

        it('re-targets a stalled run to the playhead without a scene change', async () => {
            const provider = acquireMediaProvider('/a.mp4');
            await provider.ready();
            provider.setPlaybackMode('playing');

            await decode(provider, 1);
            await settle();
            const runsBefore = state.streamStarts.length;
            expect(runsBefore).toBe(1);

            // The playhead has run well past everything the first run decoded.
            provider.requestFrame(4);
            await waitFor(
                () => state.streamStarts.length > runsBefore,
                'the re-targeted run',
            );
            await settle();

            expect(state.streamStarts.at(-1)).toBeCloseTo(4, 5);
            // Recovered: the frames after the jump are read ahead again.
            expect(provider.frameAt(4.2)).not.toBeNull();
        });

        it('keeps a run that has only just fallen behind the playhead', async () => {
            const provider = acquireMediaProvider('/a.mp4');
            await provider.ready();
            provider.setPlaybackMode('playing');

            await decode(provider, 1);
            await settle();

            // Inside the retarget slack: reopening here would cost a seek and
            // a re-decode for nothing.
            provider.setPlayhead(1.5 + 0.1);
            await settle();

            expect(state.streamStarts).toHaveLength(1);
        });
    });

    describe('preview decode size', () => {
        it('decodes at the declared surface size rather than the source size', async () => {
            state.width = 1080;
            state.height = 1920;
            const provider = acquireMediaProvider('/a.mp4');
            await provider.ready();
            provider.setPreviewSurface({ width: 530, height: 942 });

            await decode(provider, 1);

            expect(state.canvasSinkOptions.at(-1)).toEqual({
                width: 540,
                height: 960,
                fit: 'fill',
            });
            expect(state.canvases[0].canvas.width).toBe(540);
        });

        it('never upscales a source smaller than the surface', async () => {
            state.width = 480;
            state.height = 270;
            const provider = acquireMediaProvider('/a.mp4');
            await provider.ready();
            provider.setPreviewSurface({ width: 1920, height: 1080 });

            await decode(provider, 1);

            expect(state.canvasSinkOptions.at(-1)).toEqual({});
        });

        it('rebuilds the decoder only when the rounded size actually moves', async () => {
            const provider = acquireMediaProvider('/a.mp4');
            await provider.ready();
            provider.setPreviewSurface({ width: 630, height: 354 });
            await decode(provider, 1);
            expect(state.canvasSinksCreated).toBe(1);

            // A few pixels of pane resize round to the same decode size.
            provider.setPreviewSurface({ width: 640, height: 360 });
            await settle();
            expect(state.canvasSinksCreated).toBe(1);
            expect(provider.frameAt(1)).not.toBeNull();

            provider.setPreviewSurface({ width: 1280, height: 720 });
            await settle();
            await decode(provider, 2);
            expect(state.canvasSinksCreated).toBe(2);
        });

        it('hands out a distinct canvas per frame, with no pool to recycle one', async () => {
            const provider = acquireMediaProvider('/a.mp4');
            await provider.ready();
            provider.setPreviewSurface({ width: 640, height: 360 });

            await decode(provider, 1);
            await decode(provider, 2);

            expect(provider.frameAt(1)?.source).not.toBe(
                provider.frameAt(2)?.source,
            );
            expect(
                state.canvasSinkOptions.every(
                    (options) => options?.poolSize === undefined,
                ),
            ).toBe(true);
        });
    });

    describe('cache eviction', () => {
        it('evicts by frame count', async () => {
            mediaLimits.previewFrameCacheCount = 2;
            const provider = acquireMediaProvider('/a.mp4');
            await provider.ready();

            await decode(provider, 1);
            await decode(provider, 2);
            await decode(provider, 3);

            expect(provider.frameAt(1)).toBeNull();
            expect(provider.frameAt(2)).not.toBeNull();
            expect(provider.frameAt(3)).not.toBeNull();
        });

        it('evicts by byte budget, counting canvases as RGBA', async () => {
            const frameBytes = state.width * state.height * 4;
            mediaLimits.previewFrameCacheCount = 100;
            mediaLimits.previewFrameCacheBytes = frameBytes * 2;
            const provider = acquireMediaProvider('/a.mp4');
            await provider.ready();

            await decode(provider, 1);
            await decode(provider, 2);
            await decode(provider, 3);

            expect(provider.frameAt(1)).toBeNull();
            expect(provider.frameAt(3)).not.toBeNull();
        });

        it('evicts the least recently read frame, not the oldest decode', async () => {
            mediaLimits.previewFrameCacheCount = 2;
            const provider = acquireMediaProvider('/a.mp4');
            await provider.ready();

            await decode(provider, 1);
            await decode(provider, 2);
            provider.frameAt(1);
            await decode(provider, 3);

            expect(provider.frameAt(1)).not.toBeNull();
            expect(provider.frameAt(2)).toBeNull();
        });

        it('spares read-ahead frames the playhead has not reached yet', async () => {
            // Just enough room for the read-ahead window, so every new frame
            // decoded ahead forces exactly one eviction and the policy decides
            // which.
            mediaLimits.previewFrameCacheCount = 16;
            const provider = acquireMediaProvider('/a.mp4');
            await provider.ready();
            provider.setPlaybackMode('playing');

            await decode(provider, 1);
            await settle();

            const step = 1 / state.fps;

            // Reading the current frame must not promote it over the frames
            // decoded ahead of it — those are the ones about to be drawn, and
            // plain LRU would evict them first.
            for (let frame = 0; frame < 6; frame++) {
                const timeSec = 1 + frame * step;
                expect(provider.frameAt(timeSec)).not.toBeNull();
                provider.setPlayhead(timeSec);
                await settle();
            }
        });

        it('drops every cached frame when the provider is released', async () => {
            const provider = acquireMediaProvider('/a.mp4');
            await decode(provider, 1);

            provider.release();

            expect(provider.frameAt(1)).toBeNull();
        });
    });

    describe('openSequential()', () => {
        it('closes every sample the consumer passes and leaves the preview cache alone', async () => {
            const provider = acquireMediaProvider('/a.mp4');
            await decode(provider, 1);
            const previewSample = provider.frameAt(1);
            const sinksBefore = state.videoSinksCreated;

            const seen: VideoSample[] = [];
            for await (const sample of provider.openSequential(2, 2.1)) {
                expect(closeCount(sample)).toBe(0);
                seen.push(sample);
            }

            expect(seen).toHaveLength(3);
            expect(seen.every((sample) => closeCount(sample) === 1)).toBe(true);
            expect(state.videoSinksCreated).toBe(sinksBefore + 1);
            expect(state.sequentialRanges).toEqual([[2, 2.1]]);
            expect(provider.frameAt(1)).toBe(previewSample);
        });

        it('closes the in-flight sample when the consumer breaks early', async () => {
            const provider = acquireMediaProvider('/a.mp4');
            await provider.ready();

            let first: VideoSample | null = null;
            for await (const sample of provider.openSequential(2, 3)) {
                first = sample;
                break;
            }

            expect(closeCount(first)).toBe(1);
        });

        it('exports at full source resolution while the preview is downscaled', async () => {
            const provider = acquireMediaProvider('/a.mp4');
            await provider.ready();
            provider.setPreviewSurface({ width: 320, height: 180 });

            await decode(provider, 1);
            const preview = provider.frameAt(1);
            expect(preview?.source).toMatchObject({ width: 320, height: 180 });

            const sinksBefore = state.videoSinksCreated;
            let seen = 0;

            for await (const sample of provider.openSequential(2, 2.05)) {
                expect(sample.codedWidth).toBe(state.width);
                expect(sample.codedHeight).toBe(state.height);
                seen++;
            }

            expect(seen).toBeGreaterThan(0);
            // Still a VideoSampleSink, not the preview's CanvasSink.
            expect(state.videoSinksCreated).toBe(sinksBefore + 1);
        });

        it('yields nothing for an undecodable asset', async () => {
            state.canDecode = false;
            const provider = acquireMediaProvider('/a.mp4');

            const seen: VideoSample[] = [];
            for await (const sample of provider.openSequential(0, 1)) {
                seen.push(sample);
            }

            expect(seen).toHaveLength(0);
        });
    });

    describe('audio', () => {
        it('streams buffers over the requested range', async () => {
            state.hasAudio = true;
            const provider = acquireMediaProvider('/a.mp4');

            const timestamps: number[] = [];
            for await (const buffer of provider.getAudioBuffers(0, 1)) {
                timestamps.push(buffer.timestamp);
            }

            expect(timestamps).toEqual([0, 0.5]);
        });

        it('yields nothing when the asset has no audio track', async () => {
            const provider = acquireMediaProvider('/a.mp4');

            const seen: WrappedAudioBuffer[] = [];
            for await (const buffer of provider.getAudioBuffers(0, 1)) {
                seen.push(buffer);
            }

            expect(seen).toHaveLength(0);
        });
    });

    describe('perf counters', () => {
        beforeEach(() => {
            resetDecodeCounters();
            setDecodeCountingEnabled(true);
        });

        afterEach(() => {
            setDecodeCountingEnabled(false);
        });

        it('counts cache misses, hits, decodes and decode latency', async () => {
            const provider = acquireMediaProvider('/a.mp4');
            await provider.ready();

            expect(provider.frameAt(1)).toBeNull();
            expect(readDecodeCounters().misses).toBe(1);
            expect(readDecodeCounters().hits).toBe(0);

            await decode(provider, 1);
            provider.frameAt(1);

            const counters = readDecodeCounters();
            expect(counters.decoded).toBe(1);
            expect(counters.hits).toBeGreaterThanOrEqual(1);
            expect(counters.latencySamples).toBe(1);
            expect(counters.latencyTotalMs).toBeGreaterThanOrEqual(0);
        });

        it('counts a miss taken while playing as a starvation', async () => {
            const provider = acquireMediaProvider('/a.mp4');
            await provider.ready();

            provider.frameAt(1);
            expect(readDecodeCounters().starvations).toBe(0);

            provider.setPlaybackMode('playing');
            provider.frameAt(1);
            expect(readDecodeCounters().starvations).toBe(1);
        });

        it('counts read-ahead requests apart from demanded ones', async () => {
            const provider = acquireMediaProvider('/a.mp4');
            await provider.ready();
            provider.setPlaybackMode('playing');

            await decode(provider, 1);
            await waitFor(
                () => readDecodeCounters().prefetched >= 15,
                'the read-ahead counter',
            );

            expect(readDecodeCounters().prefetched).toBeGreaterThanOrEqual(15);
            expect(readDecodeCounters().decoded).toBeGreaterThanOrEqual(15);
        });

        it('counts nothing while the monitor is not running', async () => {
            setDecodeCountingEnabled(false);
            const provider = acquireMediaProvider('/a.mp4');
            await provider.ready();

            provider.frameAt(1);
            await decode(provider, 1);

            expect(readDecodeCounters()).toMatchObject({
                hits: 0,
                misses: 0,
                decoded: 0,
            });
        });
    });

    describe('decoder scheduler', () => {
        it('evicts the least recently requested decoder and re-opens it lazily', async () => {
            mediaLimits.concurrentPreviewDecoders = 1;
            const first = acquireMediaProvider('/a.mp4');
            const second = acquireMediaProvider('/b.mp4');

            await decode(first, 1);
            expect(state.canvasSinksCreated).toBe(1);

            await decode(second, 1);
            expect(state.canvasSinksCreated).toBe(2);

            expect(first.frameAt(1)).toBeNull();
            expect(second.frameAt(1)).not.toBeNull();

            await decode(first, 1);
            expect(state.canvasSinksCreated).toBe(3);
        });

        it('keeps decoders alive while under the limit', async () => {
            mediaLimits.concurrentPreviewDecoders = 3;
            const first = acquireMediaProvider('/a.mp4');
            const second = acquireMediaProvider('/b.mp4');

            await decode(first, 1);
            await decode(second, 1);

            expect(state.canvasSinksCreated).toBe(2);
            expect(first.frameAt(1)).not.toBeNull();
            expect(second.frameAt(1)).not.toBeNull();
        });
    });
});
