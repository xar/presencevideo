import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset, AudioClip, VideoLayer } from '@/types';
import {
    audibleTimelineMs,
    buildCue,
    buildGainEvents,
    createAudioEngine,
    ctxToTimelineMs,
    envelopeGainAt,
    itemsInWindow,
    itemsOutsideKeepWindow,
    planPreviewAudio,
    timelineToCtxSec,
} from '../audio-engine';
import type {
    AudioEngineDeps,
    ClockAnchor,
    EngineAudioContext,
} from '../audio-engine';
import { mediaLimits } from '../editor-features';
import type { AudioPlanItem } from '../export-audio';
import {
    makeAudioTrack,
    makeProject,
    makeScene,
    makeVideoTrack,
} from './fixtures';

/* ------------------------------------------------------------------ */
/* fixtures                                                            */
/* ------------------------------------------------------------------ */

function planItem(overrides: Partial<AudioPlanItem> = {}): AudioPlanItem {
    return {
        id: 'item',
        url: 'a.mp3',
        assetId: 1,
        startMs: 0,
        durationMs: 1000,
        sourceStartSec: 0,
        sourceEndSec: 1,
        speed: 1,
        gain: 1,
        fadeInMs: 0,
        fadeOutMs: 0,
        ...overrides,
    };
}

function anchorAt(ctxTimeSec = 10, timelineMs = 0, rate = 1): ClockAnchor {
    return { ctxTimeSec, timelineMs, rate };
}

function asset(id: number, url: string, durationMs = 30000): Asset {
    return {
        id,
        user_id: 1,
        project_id: 1,
        type: 'video',
        source: 'upload',
        name: url,
        path: url,
        disk: 'local',
        mime_type: 'video/mp4',
        size_bytes: 1,
        duration_ms: durationMs,
        width: 1920,
        height: 1080,
        thumbnail_path: null,
        metadata: {},
        created_at: '',
        updated_at: '',
        url,
    } as unknown as Asset;
}

function videoLayer(overrides: Partial<VideoLayer> = {}): VideoLayer {
    return {
        id: 'vl',
        type: 'video',
        asset_id: 1,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        z_index: 0,
        ...overrides,
    };
}

function audioClip(overrides: Partial<AudioClip> = {}): AudioClip {
    return {
        id: 'clip',
        asset_id: 2,
        start_ms: 0,
        duration_ms: 1000,
        volume: 1,
        ...overrides,
    };
}

/* ------------------------------------------------------------------ */
/* Web Audio double — jsdom has none at all                            */
/* ------------------------------------------------------------------ */

type ParamEvent = { type: 'set' | 'ramp'; value: number; timeSec: number };

class FakeParam {
    value = 1;
    readonly events: ParamEvent[] = [];

    setValueAtTime(value: number, timeSec: number): void {
        this.events.push({ type: 'set', value, timeSec });
    }

    linearRampToValueAtTime(value: number, timeSec: number): void {
        this.events.push({ type: 'ramp', value, timeSec });
    }
}

class FakeNode {
    readonly outputs: FakeNode[] = [];
    disconnected = 0;

    connect<T extends FakeNode>(target: T): T {
        this.outputs.push(target);

        return target;
    }

    disconnect(): void {
        this.disconnected++;
    }
}

class FakeGain extends FakeNode {
    readonly gain = new FakeParam();
}

class FakeSource extends FakeNode {
    buffer: AudioBuffer | null = null;
    readonly playbackRate = { value: 1 };
    readonly startCalls: number[][] = [];
    readonly stopCalls: (number | undefined)[] = [];

    start(...args: number[]): void {
        this.startCalls.push(args);
    }

    stop(when?: number): void {
        this.stopCalls.push(when);
    }
}

class FakeContext {
    currentTime = 100;
    state: AudioContextState = 'running';
    sampleRate = 48000;
    baseLatency = 0;
    outputLatency = 0;
    readonly destination = new FakeNode();
    readonly sources: FakeSource[] = [];
    readonly gains: FakeGain[] = [];
    readonly compressors: FakeNode[] = [];
    closed = false;
    resumed = 0;

    createBufferSource(): AudioBufferSourceNode {
        const source = new FakeSource();
        this.sources.push(source);

        return source as unknown as AudioBufferSourceNode;
    }

    createGain(): GainNode {
        const gain = new FakeGain();
        this.gains.push(gain);

        return gain as unknown as GainNode;
    }

    createDynamicsCompressor(): DynamicsCompressorNode {
        const node = new FakeNode() as FakeNode & {
            threshold: FakeParam;
            knee: FakeParam;
            ratio: FakeParam;
            attack: FakeParam;
            release: FakeParam;
        };
        node.threshold = new FakeParam();
        node.knee = new FakeParam();
        node.ratio = new FakeParam();
        node.attack = new FakeParam();
        node.release = new FakeParam();
        this.compressors.push(node);

        return node as unknown as DynamicsCompressorNode;
    }

    createBuffer(
        channels: number,
        frames: number,
        sampleRate: number,
    ): AudioBuffer {
        return fakeBuffer(channels, frames, sampleRate);
    }

    async resume(): Promise<void> {
        this.resumed++;
        this.state = 'running';
    }

    async close(): Promise<void> {
        this.closed = true;
    }

    /** The master gain is the first gain the engine ever creates. */
    get master(): FakeGain | undefined {
        return this.gains[0];
    }

    get cueGains(): FakeGain[] {
        return this.gains.slice(1);
    }
}

function fakeBuffer(
    channels = 2,
    frames = 48000,
    sampleRate = 48000,
): AudioBuffer {
    const data = Array.from(
        { length: channels },
        () => new Float32Array(frames),
    );

    return {
        numberOfChannels: channels,
        length: frames,
        sampleRate,
        duration: frames / sampleRate,
        getChannelData: (index: number) => data[index],
        copyToChannel: () => undefined,
        copyFromChannel: () => undefined,
    } as unknown as AudioBuffer;
}

type Harness = {
    context: FakeContext;
    deps: AudioEngineDeps;
    released: string[];
    decodeCalls: string[];
};

function harness(overrides: Partial<AudioEngineDeps> = {}): Harness {
    const context = new FakeContext();
    const released: string[] = [];
    const decodeCalls: string[] = [];

    const deps: AudioEngineDeps = {
        createContext: () => context as unknown as EngineAudioContext,
        decode: async (_ctx, url) => {
            decodeCalls.push(url);

            return fakeBuffer();
        },
        releaseUrl: (url) => released.push(url),
        ...overrides,
    };

    return { context, deps, released, decodeCalls };
}

/** Lets the queued decode promises settle before asserting on scheduling. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/* ------------------------------------------------------------------ */
/* pure: clock                                                         */
/* ------------------------------------------------------------------ */

describe('audio clock maths', () => {
    it('round-trips between context and timeline time', () => {
        const anchor = anchorAt(10, 2000);

        expect(timelineToCtxSec(anchor, 3000)).toBe(11);
        expect(ctxToTimelineMs(anchor, 11)).toBe(3000);
    });

    it('scales by the playback rate in both directions', () => {
        const anchor = anchorAt(10, 0, 2);

        // At 2x, one context second covers two timeline seconds.
        expect(ctxToTimelineMs(anchor, 11)).toBe(2000);
        expect(timelineToCtxSec(anchor, 2000)).toBe(11);
    });

    it('lags the scheduler by the output latency so picture matches sound', () => {
        const anchor = anchorAt(10, 0);

        expect(audibleTimelineMs(anchor, 11, 0.02)).toBeCloseTo(980, 6);
        expect(audibleTimelineMs(anchor, 11, 0)).toBeCloseTo(1000, 6);
    });
});

/* ------------------------------------------------------------------ */
/* pure: windows                                                       */
/* ------------------------------------------------------------------ */

describe('scheduling windows', () => {
    const items = [
        planItem({ id: 'past', startMs: 0, durationMs: 1000 }),
        planItem({ id: 'now', startMs: 900, durationMs: 1000 }),
        planItem({ id: 'soon', startMs: 2500, durationMs: 1000 }),
        planItem({ id: 'far', startMs: 60000, durationMs: 1000 }),
    ];

    it('takes only items overlapping the lookahead', () => {
        expect(itemsInWindow(items, 1000, 2000).map((item) => item.id)).toEqual(
            ['now', 'soon'],
        );
    });

    it('releases items outside the keep window on both sides', () => {
        expect(
            itemsOutsideKeepWindow(items, 30000, 10000).map((item) => item.id),
        ).toEqual(['past', 'now', 'soon', 'far']);
        expect(
            itemsOutsideKeepWindow(items, 1000, 10000).map((item) => item.id),
        ).toEqual(['far']);
    });
});

/* ------------------------------------------------------------------ */
/* pure: gain envelope                                                 */
/* ------------------------------------------------------------------ */

describe('gain envelope', () => {
    it('reads the fade value at a position, clamped to 0..gain', () => {
        const item = planItem({
            startMs: 1000,
            durationMs: 2000,
            gain: 0.5,
            fadeInMs: 400,
            fadeOutMs: 400,
        });

        expect(envelopeGainAt(item, 1000)).toBe(0);
        expect(envelopeGainAt(item, 1200)).toBeCloseTo(0.25, 6);
        expect(envelopeGainAt(item, 2000)).toBe(0.5);
        expect(envelopeGainAt(item, 2800)).toBeCloseTo(0.25, 6);
        expect(envelopeGainAt(item, 3000)).toBe(0);
    });

    it('schedules a flat value when there are no fades', () => {
        const item = planItem({ gain: 0.4 });

        expect(buildGainEvents(item, 0, 5, 1)).toEqual([
            { type: 'set', value: 0.4, timeSec: 5 },
        ]);
    });

    it('ramps in and out at the right context times', () => {
        const item = planItem({
            startMs: 1000,
            durationMs: 2000,
            gain: 0.8,
            fadeInMs: 500,
            fadeOutMs: 250,
        });

        expect(buildGainEvents(item, 1000, 20, 1)).toEqual([
            { type: 'set', value: 0, timeSec: 20 },
            { type: 'ramp', value: 0.8, timeSec: 20.5 },
            { type: 'set', value: 0.8, timeSec: 21.75 },
            { type: 'ramp', value: 0, timeSec: 22 },
        ]);
    });

    it('compresses ramps by the playback rate', () => {
        const item = planItem({
            durationMs: 2000,
            fadeInMs: 500,
            fadeOutMs: 500,
        });

        expect(buildGainEvents(item, 0, 0, 2)).toEqual([
            { type: 'set', value: 0, timeSec: 0 },
            { type: 'ramp', value: 1, timeSec: 0.25 },
            { type: 'set', value: 1, timeSec: 0.75 },
            { type: 'ramp', value: 0, timeSec: 1 },
        ]);
    });

    it('starts mid-fade at the value the fade had reached', () => {
        const item = planItem({ durationMs: 2000, gain: 1, fadeInMs: 1000 });
        const [first, second] = buildGainEvents(item, 500, 7, 1);

        expect(first).toEqual({ type: 'set', value: 0.5, timeSec: 7 });
        expect(second).toEqual({ type: 'ramp', value: 1, timeSec: 7.5 });
    });

    it('never overlaps a fade-out ramp with the fade-in on a very short clip', () => {
        // Fades are clamped to the clip duration by the plan, so both can be
        // the full length; the fade-out must still begin after the fade-in.
        const item = planItem({
            durationMs: 1000,
            fadeInMs: 1000,
            fadeOutMs: 1000,
        });
        const events = buildGainEvents(item, 0, 0, 1);
        const times = events.map((event) => event.timeSec);

        expect(times).toEqual([...times].sort((a, b) => a - b));
        expect(events.at(-1)).toEqual({ type: 'ramp', value: 0, timeSec: 1 });
    });
});

/* ------------------------------------------------------------------ */
/* pure: cues                                                          */
/* ------------------------------------------------------------------ */

describe('buildCue', () => {
    it('places a future item at its timeline position and plays it whole', () => {
        const item = planItem({
            startMs: 2000,
            durationMs: 1500,
            sourceStartSec: 4,
            sourceEndSec: 5.5,
        });
        const cue = buildCue(item, anchorAt(10, 0), 0, 10);

        expect(cue).not.toBeNull();
        expect(cue!.whenSec).toBe(12);
        expect(cue!.offsetSec).toBe(0);
        expect(cue!.sourceDurationSec).toBe(1.5);
        expect(cue!.contextDurationSec).toBe(1.5);
        expect(cue!.rate).toBe(1);
        expect(cue!.sourceStartSec).toBe(4);
    });

    it('enters an already-running item mid-source rather than replaying it', () => {
        const item = planItem({
            startMs: 1000,
            durationMs: 4000,
            sourceStartSec: 2,
            sourceEndSec: 6,
        });
        // Playhead 1.5s into the item; the anchor puts that at ctx 11.5, which
        // is in the past, so the cue re-bases onto now.
        const cue = buildCue(item, anchorAt(10, 0), 2500, 12.5);

        expect(cue!.whenSec).toBe(12.5);
        expect(cue!.offsetSec).toBe(1.5);
        expect(cue!.sourceDurationSec).toBe(2.5);
        expect(cue!.contextDurationSec).toBe(2.5);
    });

    it('returns null for an item that has already finished', () => {
        const item = planItem({ startMs: 0, durationMs: 1000 });

        expect(buildCue(item, anchorAt(10, 0), 1000, 11)).toBeNull();
        expect(buildCue(item, anchorAt(10, 0), 5000, 15)).toBeNull();
    });

    it('consumes source faster than context time when the clip has speed', () => {
        const item = planItem({
            startMs: 0,
            durationMs: 2000,
            speed: 2,
            sourceStartSec: 0,
            sourceEndSec: 4,
        });
        const cue = buildCue(item, anchorAt(10, 0), 0, 10);

        expect(cue!.rate).toBe(2);
        expect(cue!.sourceDurationSec).toBe(4);
        expect(cue!.contextDurationSec).toBe(2);
    });

    it('combines clip speed with the timeline rate', () => {
        const item = planItem({ startMs: 0, durationMs: 2000, speed: 2 });
        const cue = buildCue(item, anchorAt(10, 0, 2), 0, 10);

        expect(cue!.rate).toBe(4);
        // Two timeline seconds at 2x take one context second.
        expect(cue!.contextDurationSec).toBe(1);
        expect(cue!.sourceDurationSec).toBe(4);
    });

    it('offsets into the buffer by trimmed source time, not timeline time', () => {
        const item = planItem({
            startMs: 1000,
            durationMs: 2000,
            sourceStartSec: 5,
            sourceEndSec: 7,
            speed: 2,
        });
        const cue = buildCue(item, anchorAt(10, 0), 1500, 11.5);

        // 0.5s into the item at 2x speed = 1s into the decoded range, which
        // itself begins at the trim point.
        expect(cue!.offsetSec).toBe(1);
        expect(cue!.sourceStartSec).toBe(5);
    });
});

/* ------------------------------------------------------------------ */
/* the plan — including the regression                                 */
/* ------------------------------------------------------------------ */

describe('preview audio plan', () => {
    it('schedules scene VIDEO-LAYER audio (the preview regression)', () => {
        const project = makeProject({
            scenes: [
                makeScene({
                    duration_ms: 3000,
                    layers: [videoLayer({ asset_id: 1 })],
                }),
            ],
            audio_tracks: [],
            video_tracks: [],
            assets: [asset(1, 'scene-video.mp4')],
        });

        const plan = planPreviewAudio(project);

        expect(plan).toHaveLength(1);
        expect(plan[0].url).toBe('scene-video.mp4');
        expect(plan[0].startMs).toBe(0);
        expect(plan[0].durationMs).toBe(3000);
    });

    it('mixes scene video-layer audio alongside audio-track clips', () => {
        const project = makeProject({
            scenes: [
                makeScene({
                    duration_ms: 3000,
                    layers: [videoLayer({ asset_id: 1 })],
                }),
            ],
            audio_tracks: [
                makeAudioTrack({ clips: [audioClip({ asset_id: 2 })] }),
            ],
            video_tracks: [],
            assets: [asset(1, 'scene-video.mp4'), asset(2, 'music.mp3')],
        });

        expect(
            planPreviewAudio(project)
                .map((item) => item.url)
                .sort(),
        ).toEqual(['music.mp3', 'scene-video.mp4']);
    });

    it('excludes muted layers and muted tracks', () => {
        const project = makeProject({
            scenes: [
                makeScene({
                    duration_ms: 3000,
                    layers: [videoLayer({ asset_id: 1, muted: true })],
                }),
            ],
            audio_tracks: [
                makeAudioTrack({
                    muted: true,
                    clips: [audioClip({ asset_id: 2 })],
                }),
            ],
            video_tracks: [],
            assets: [asset(1, 'scene-video.mp4'), asset(2, 'music.mp3')],
        });

        expect(planPreviewAudio(project)).toEqual([]);
    });

    it('multiplies clip volume by track volume, and layer volume stands alone', () => {
        const project = makeProject({
            scenes: [
                makeScene({
                    duration_ms: 3000,
                    layers: [videoLayer({ asset_id: 1, volume: 0.5 })],
                }),
            ],
            audio_tracks: [
                makeAudioTrack({
                    volume: 0.5,
                    clips: [audioClip({ asset_id: 2, volume: 0.4 })],
                }),
            ],
            video_tracks: [makeVideoTrack({ clips: [] })],
            assets: [asset(1, 'scene-video.mp4'), asset(2, 'music.mp3')],
        });

        const plan = planPreviewAudio(project);

        expect(plan.find((item) => item.url === 'music.mp3')!.gain).toBeCloseTo(
            0.2,
            6,
        );
        expect(
            plan.find((item) => item.url === 'scene-video.mp4')!.gain,
        ).toBeCloseTo(0.5, 6);
    });

    it('positions clips on the transition-mapped timeline', () => {
        const project = makeProject({
            fps: 30,
            scenes: [
                makeScene({
                    duration_ms: 3000,
                    transition: { type: 'fade', duration_ms: 1000 },
                }),
                makeScene({ duration_ms: 3000 }),
            ],
            audio_tracks: [
                makeAudioTrack({
                    clips: [audioClip({ asset_id: 2, start_ms: 4000 })],
                }),
            ],
            video_tracks: [],
            assets: [asset(2, 'music.mp3')],
        });

        // The 1s transition overlap pulls everything in the second scene earlier.
        expect(planPreviewAudio(project)[0].startMs).toBe(3000);
    });
});

/* ------------------------------------------------------------------ */
/* the engine                                                          */
/* ------------------------------------------------------------------ */

describe('audio engine', () => {
    beforeEach(() => {
        vi.useRealTimers();
    });

    it('reports no audio and no clock for a silent project', async () => {
        const { context, deps } = harness();
        const engine = createAudioEngine(deps);

        engine.setPlan([]);
        await engine.play(0);

        expect(engine.hasAudio).toBe(false);
        expect(engine.isMasterClock).toBe(false);
        // The timeline must fall back to its own rAF clock.
        expect(engine.currentTimeMs()).toBeNull();
        expect(context.sources).toHaveLength(0);

        engine.dispose();
    });

    it('degrades cleanly when AudioContext is unavailable', async () => {
        const { deps } = harness({ createContext: () => null });
        const engine = createAudioEngine(deps);

        engine.setPlan([planItem()]);
        await expect(engine.play(0)).resolves.toBeUndefined();

        expect(engine.currentTimeMs()).toBeNull();
        expect(engine.isMasterClock).toBe(false);
        expect(() => engine.dispose()).not.toThrow();
    });

    it('degrades cleanly when constructing the context throws', async () => {
        const { deps } = harness({
            createContext: () => {
                throw new Error('no web audio');
            },
        });
        const engine = createAudioEngine(deps);

        engine.setPlan([planItem()]);
        await engine.play(0);

        expect(engine.currentTimeMs()).toBeNull();
        engine.dispose();
    });

    it('resumes the suspended context on play — the gesture the button carries', async () => {
        const { context, deps } = harness();
        context.state = 'suspended';
        const engine = createAudioEngine(deps);

        engine.setPlan([planItem()]);
        await engine.play(0);

        expect(context.resumed).toBe(1);
        expect(engine.isMasterClock).toBe(true);

        engine.dispose();
    });

    it('stays off the clock when the context refuses to resume', async () => {
        const { context, deps } = harness();
        context.state = 'suspended';
        context.resume = async () => {
            throw new Error('blocked');
        };
        const engine = createAudioEngine(deps);

        engine.setPlan([planItem()]);
        await engine.play(0);

        expect(engine.currentTimeMs()).toBeNull();
        engine.dispose();
    });

    it('stays paused when the transport stops while resume is pending', async () => {
        const { context, deps } = harness();
        context.state = 'suspended';
        let lift = () => {};
        context.resume = () =>
            new Promise<void>((resolve) => {
                lift = () => {
                    context.state = 'running';
                    resolve();
                };
            });
        const engine = createAudioEngine(deps);

        engine.setPlan([planItem({ durationMs: 60000 })]);
        const started = engine.play(0);
        engine.pause();
        lift();
        await started;

        expect(engine.currentTimeMs()).toBeNull();
        expect(context.sources).toHaveLength(0);

        engine.dispose();
    });

    it('schedules a decoded cue with its own gain and no division by input count', async () => {
        const { context, deps } = harness();
        const engine = createAudioEngine(deps);

        engine.setPlan([
            planItem({ id: 'a', url: 'a.mp3', gain: 1 }),
            planItem({ id: 'b', url: 'b.mp3', gain: 1 }),
            planItem({ id: 'c', url: 'c.mp3', gain: 1 }),
        ]);
        await engine.play(0);
        await flush();
        engine.tick();
        await flush();
        engine.tick();
        await flush();

        expect(context.sources).toHaveLength(3);
        // Three full-volume clips stay at full volume each: the mix sums
        // verbatim, exactly as the server's `normalize=0` amix does.
        for (const gain of context.cueGains) {
            expect(gain.gain.events).toEqual([
                { type: 'set', value: 1, timeSec: expect.any(Number) },
            ]);
        }
        expect(context.master!.gain.value).toBe(1);

        engine.dispose();
    });

    it('routes the sum through a limiter into the destination', async () => {
        const { context, deps } = harness();
        const engine = createAudioEngine(deps);

        engine.setPlan([planItem()]);
        await engine.play(0);

        const limiter = context.compressors[0] as FakeNode & {
            threshold: FakeParam;
        };

        expect(context.master!.outputs).toContain(limiter);
        expect(limiter.outputs).toContain(context.destination);
        // 0.95 as dBFS, matching FFmpegService::AUDIO_LIMITER.
        expect(limiter.threshold.value).toBeCloseTo(-0.4455, 3);

        engine.dispose();
    });

    it('starts a source with the offset and duration the cue computed', async () => {
        const { context, deps } = harness();
        const engine = createAudioEngine(deps);

        engine.setPlan([
            planItem({
                startMs: 2000,
                durationMs: 1000,
                sourceStartSec: 3,
                sourceEndSec: 4,
            }),
        ]);
        await engine.play(1000);
        await flush();
        engine.tick();
        await flush();

        const source = context.sources[0];

        expect(source.startCalls).toHaveLength(1);
        const [when, offset, duration] = source.startCalls[0];
        expect(when).toBeCloseTo(101, 6);
        expect(offset).toBe(0);
        expect(duration).toBe(1);
        expect(source.stopCalls[0]).toBeCloseTo(102, 6);

        engine.dispose();
    });

    it('respects the concurrent decode budget', async () => {
        const { deps, decodeCalls } = harness();
        const engine = createAudioEngine(deps);

        engine.setPlan([
            planItem({ id: 'a', url: 'a.mp3' }),
            planItem({ id: 'b', url: 'b.mp3' }),
            planItem({ id: 'c', url: 'c.mp3' }),
            planItem({ id: 'd', url: 'd.mp3' }),
        ]);
        await engine.play(0);

        expect(decodeCalls).toHaveLength(mediaLimits.concurrentAudioDecodes);

        engine.dispose();
    });

    it('only decodes items inside the lookahead window', async () => {
        const { deps, decodeCalls } = harness();
        const engine = createAudioEngine(deps);

        engine.setPlan([
            planItem({
                id: 'near',
                url: 'near.mp3',
                startMs: 0,
                durationMs: 1000,
            }),
            planItem({
                id: 'far',
                url: 'far.mp3',
                startMs: mediaLimits.audioScheduleAheadMs + 5000,
                durationMs: 1000,
            }),
        ]);
        await engine.play(0);
        await flush();

        expect(decodeCalls).toEqual(['near.mp3']);

        engine.dispose();
    });

    it('releases providers for clips far from the playhead', async () => {
        const { deps, released } = harness();
        const engine = createAudioEngine(deps);

        engine.setPlan([
            planItem({
                id: 'near',
                url: 'near.mp3',
                startMs: 0,
                durationMs: 1000,
            }),
        ]);
        await engine.play(0);
        await flush();
        engine.tick();

        expect(released).toEqual([]);

        // Jump far past the only clip; its provider is no longer worth holding.
        engine.seek(mediaLimits.audioProviderKeepMs + 5000);
        await flush();

        expect(released).toEqual(['near.mp3']);

        engine.dispose();
    });

    it('advances with the context clock and honours the latency offset', async () => {
        const { context, deps } = harness();
        context.outputLatency = 0.02;
        const engine = createAudioEngine(deps);

        engine.setPlan([planItem({ durationMs: 60000 })]);
        await engine.play(0);

        // Nothing is audible yet at the instant of play: the first samples are
        // still in the output buffer, so the clock starts clamped at zero.
        expect(engine.currentTimeMs()).toBeCloseTo(0, 6);

        context.currentTime += 1;
        expect(engine.currentTimeMs()).toBeCloseTo(980, 6);

        engine.dispose();
    });

    it('advances at the playback rate after a rate change', async () => {
        const { context, deps } = harness();
        const engine = createAudioEngine(deps);

        engine.setPlan([planItem({ durationMs: 60000 })]);
        await engine.play(0);
        context.currentTime += 1;
        expect(engine.currentTimeMs()).toBeCloseTo(1000, 6);

        engine.setPlaybackRate(2);
        context.currentTime += 1;

        // One more context second, now worth two timeline seconds.
        expect(engine.currentTimeMs()).toBeCloseTo(3000, 6);

        engine.dispose();
    });

    it('re-schedules every source when the rate changes', async () => {
        const { context, deps } = harness();
        const engine = createAudioEngine(deps);

        engine.setPlan([planItem({ durationMs: 60000 })]);
        await engine.play(0);
        await flush();
        engine.tick();
        await flush();

        const first = context.sources[0];
        engine.setPlaybackRate(2);
        await flush();

        expect(first.stopCalls.length).toBeGreaterThan(1);
        expect(context.sources.length).toBeGreaterThan(1);
        expect(context.sources.at(-1)!.playbackRate.value).toBe(2);

        engine.dispose();
    });

    it('holds its position across pause and resumes from it', async () => {
        const { context, deps } = harness();
        const engine = createAudioEngine(deps);

        engine.setPlan([planItem({ durationMs: 60000 })]);
        await engine.play(0);
        context.currentTime += 2;
        engine.pause();

        expect(engine.currentTimeMs()).toBeNull();
        expect(engine.isMasterClock).toBe(false);

        // Context time keeps running while paused; the clock must not.
        context.currentTime += 5;
        await engine.play(2000);
        expect(engine.currentTimeMs()).toBeCloseTo(2000, 6);

        engine.dispose();
    });

    it('stops and disconnects previously scheduled nodes on seek', async () => {
        const { context, deps } = harness();
        const engine = createAudioEngine(deps);

        engine.setPlan([planItem({ durationMs: 60000 })]);
        await engine.play(0);
        await flush();
        engine.tick();
        await flush();

        const first = context.sources[0];
        expect(first.startCalls).toHaveLength(1);

        engine.seek(5000);
        await flush();

        expect(first.stopCalls.length).toBeGreaterThan(1);
        expect(first.disconnected).toBeGreaterThan(0);
        expect(engine.currentTimeMs()).toBeCloseTo(5000, 6);

        engine.dispose();
    });

    it('re-schedules in place when the plan changes mid-playback', async () => {
        const { context, deps } = harness();
        const engine = createAudioEngine(deps);

        engine.setPlan([
            planItem({ id: 'a', url: 'a.mp3', durationMs: 60000 }),
        ]);
        await engine.play(0);
        await flush();
        engine.tick();
        await flush();

        const first = context.sources[0];
        engine.setPlan([
            planItem({ id: 'b', url: 'b.mp3', durationMs: 60000 }),
        ]);
        await flush();

        expect(first.stopCalls.length).toBeGreaterThan(1);
        expect(context.sources.length).toBeGreaterThan(1);

        engine.dispose();
    });

    it('stops and disconnects every node, and closes the context, on dispose', async () => {
        const { context, deps, released } = harness();
        const engine = createAudioEngine(deps);

        engine.setPlan([
            planItem({ id: 'a', url: 'a.mp3', durationMs: 60000 }),
            planItem({ id: 'b', url: 'b.mp3', startMs: 0, durationMs: 60000 }),
        ]);
        await engine.play(0);
        await flush();
        engine.tick();
        await flush();
        engine.tick();
        await flush();

        expect(context.sources.length).toBeGreaterThan(0);

        engine.dispose();

        for (const source of context.sources) {
            expect(source.disconnected).toBeGreaterThan(0);
        }
        for (const gain of context.cueGains) {
            expect(gain.disconnected).toBeGreaterThan(0);
        }
        expect(context.master!.disconnected).toBeGreaterThan(0);
        expect(context.closed).toBe(true);
        expect(released.sort()).toEqual(['a.mp3', 'b.mp3']);
        expect(engine.currentTimeMs()).toBeNull();
    });

    it('survives an asset that cannot be decoded', async () => {
        const { context, deps } = harness({ decode: async () => null });
        const engine = createAudioEngine(deps);

        engine.setPlan([planItem()]);
        await engine.play(0);
        await flush();
        engine.tick();
        await flush();

        expect(context.sources).toHaveLength(0);
        // The clock is still authoritative: silence is not a stopped clock.
        expect(engine.currentTimeMs()).toBeCloseTo(0, 6);

        engine.dispose();
    });

    it('never schedules the same item twice', async () => {
        const { context, deps } = harness();
        const engine = createAudioEngine(deps);

        engine.setPlan([planItem({ durationMs: 60000 })]);
        await engine.play(0);
        await flush();
        engine.tick();
        engine.tick();
        await flush();

        expect(context.sources).toHaveLength(1);

        engine.dispose();
    });
});
