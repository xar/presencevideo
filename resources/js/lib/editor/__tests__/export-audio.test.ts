import { describe, expect, it, vi } from 'vitest';
import type { AudioTrack, Project, VideoLayer } from '@/types';
import {
    applyPeakLimiter,
    AUDIO_PEAK_CEILING,
    planProjectAudio,
    renderAudioPlan,
    sliceAudioBuffer
    
    
} from '../export-audio';
import type {AudioPlanItem, OfflineMixContext} from '../export-audio';
import { makeAudioTrack, makeProject, makeScene } from './fixtures';

function audioAsset(id: number, url: string, durationMs = 10000) {
    return {
        id,
        user_id: 1,
        project_id: 1,
        type: 'audio' as const,
        source: 'upload' as const,
        name: url,
        path: url,
        disk: 'local',
        mime_type: 'audio/mpeg',
        size_bytes: 1,
        duration_ms: durationMs,
        width: null,
        height: null,
        thumbnail_path: null,
        metadata: {},
        created_at: '',
        updated_at: '',
        url,
    };
}

function videoLayer(overrides: Partial<VideoLayer> = {}): VideoLayer {
    return {
        id: 'video-layer',
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

function audioTrackWith(
    clips: AudioTrack['clips'],
    overrides: Partial<AudioTrack> = {},
): AudioTrack {
    return makeAudioTrack({ clips, ...overrides });
}

/** Minimal AudioBuffer stand-in; jsdom has no Web Audio at all. */
function fakeBuffer(channels: number[][], sampleRate = 48000): AudioBuffer {
    const data = channels.map((values) => Float32Array.from(values));

    return {
        numberOfChannels: data.length,
        length: data[0]?.length ?? 0,
        sampleRate,
        duration: (data[0]?.length ?? 0) / sampleRate,
        getChannelData: (index: number) => data[index],
        copyToChannel: (source: Float32Array, index: number, offset = 0) => {
            data[index].set(source, offset);
        },
        copyFromChannel: () => undefined,
    } as unknown as AudioBuffer;
}

type GainSpy = {
    events: { type: string; value: number; time: number }[];
    connectedToDestination: boolean;
};

/** Records the graph so gain staging can be asserted rather than assumed. */
function fakeContext(rendered: AudioBuffer) {
    const gains: GainSpy[] = [];
    const sources: {
        buffer: AudioBuffer | null;
        playbackRate: number;
        start: number;
        stop: number;
    }[] = [];
    const destination = { id: 'destination' };

    const context = {
        sampleRate: 48000,
        destination: destination as unknown as AudioDestinationNode,
        createGain: () => {
            const spy: GainSpy = { events: [], connectedToDestination: false };
            gains.push(spy);

            return {
                gain: {
                    setValueAtTime: (value: number, time: number) => {
                        spy.events.push({ type: 'set', value, time });
                    },
                    linearRampToValueAtTime: (value: number, time: number) => {
                        spy.events.push({ type: 'ramp', value, time });
                    },
                },
                connect: (target: unknown) => {
                    spy.connectedToDestination = target === destination;
                },
            } as unknown as GainNode;
        },
        createBufferSource: () => {
            const node = {
                buffer: null as AudioBuffer | null,
                playbackRate: 1,
                start: 0,
                stop: 0,
            };
            sources.push(node);

            return {
                set buffer(value: AudioBuffer | null) {
                    node.buffer = value;
                },
                get buffer() {
                    return node.buffer;
                },
                playbackRate: {
                    set value(rate: number) {
                        node.playbackRate = rate;
                    },
                    get value() {
                        return node.playbackRate;
                    },
                },
                connect: () => undefined,
                start: (time: number) => {
                    node.start = time;
                },
                stop: (time: number) => {
                    node.stop = time;
                },
            } as unknown as AudioBufferSourceNode;
        },
        createBuffer: (channels: number, frames: number) =>
            fakeBuffer(
                Array.from({ length: channels }, () =>
                    new Array(frames).fill(0),
                ),
            ),
        startRendering: async () => rendered,
    };

    return { context: context as unknown as OfflineMixContext, gains, sources };
}

describe('planProjectAudio audio tracks', () => {
    it('keeps clip trim, timeline position, fades and volume', () => {
        const project: Project = makeProject({
            assets: [audioAsset(1, 'music.mp3')],
            audio_tracks: [
                audioTrackWith(
                    [
                        {
                            id: 'clip-1',
                            asset_id: 1,
                            start_ms: 1000,
                            duration_ms: 2000,
                            trim_start_ms: 500,
                            volume: 0.5,
                            fade_in_ms: 250,
                            fade_out_ms: 250,
                        },
                    ],
                    { volume: 0.5 },
                ),
            ],
        });

        expect(planProjectAudio(project)).toEqual<AudioPlanItem[]>([
            {
                id: 'clip-1',
                url: 'music.mp3',
                assetId: 1,
                startMs: 1000,
                durationMs: 2000,
                sourceStartSec: 0.5,
                sourceEndSec: 2.5,
                speed: 1,
                gain: 0.25,
                fadeInMs: 250,
                fadeOutMs: 250,
            },
        ]);
    });

    it('drops muted tracks entirely', () => {
        const project = makeProject({
            assets: [audioAsset(1, 'music.mp3')],
            audio_tracks: [
                audioTrackWith(
                    [
                        {
                            id: 'clip-1',
                            asset_id: 1,
                            start_ms: 0,
                            duration_ms: 1000,
                            volume: 1,
                        },
                    ],
                    { muted: true },
                ),
            ],
        });

        expect(planProjectAudio(project)).toEqual([]);
    });

    it('drops silent clips and clips whose asset is missing', () => {
        const project = makeProject({
            assets: [audioAsset(1, 'music.mp3')],
            audio_tracks: [
                audioTrackWith([
                    {
                        id: 'silent',
                        asset_id: 1,
                        start_ms: 0,
                        duration_ms: 1000,
                        volume: 0,
                    },
                    {
                        id: 'orphan',
                        asset_id: 99,
                        start_ms: 0,
                        duration_ms: 1000,
                        volume: 1,
                    },
                ]),
            ],
        });

        expect(planProjectAudio(project)).toEqual([]);
    });

    it('maps clip starts onto the transition-shortened timeline', () => {
        const project = makeProject({
            assets: [audioAsset(1, 'music.mp3')],
            scenes: [
                makeScene({
                    duration_ms: 2000,
                    transition: { type: 'fade', duration_ms: 500 },
                }),
                makeScene({ duration_ms: 2000 }),
            ],
            audio_tracks: [
                audioTrackWith([
                    {
                        id: 'clip-1',
                        asset_id: 1,
                        start_ms: 2000,
                        duration_ms: 1000,
                        volume: 1,
                    },
                ]),
            ],
        });

        expect(planProjectAudio(project)[0].startMs).toBe(1500);
    });
});

describe('planProjectAudio scene video audio', () => {
    it('honours trim, speed and layer volume', () => {
        const project = makeProject({
            assets: [audioAsset(1, 'clip.mp4')],
            scenes: [
                makeScene({
                    duration_ms: 2000,
                    layers: [
                        videoLayer({
                            trim_start_ms: 1000,
                            speed: 2,
                            volume: 0.5,
                        }),
                    ],
                }),
            ],
        });

        const [item] = planProjectAudio(project);

        expect(item.sourceStartSec).toBe(1);
        expect(item.sourceEndSec).toBe(5);
        expect(item.speed).toBe(2);
        expect(item.gain).toBe(0.5);
        expect(item.durationMs).toBe(2000);
    });

    it('stops at the end of the trimmed source instead of inventing audio', () => {
        const project = makeProject({
            assets: [audioAsset(1, 'clip.mp4', 3000)],
            scenes: [makeScene({ duration_ms: 5000, layers: [videoLayer()] })],
        });

        const [item] = planProjectAudio(project);

        expect(item.sourceEndSec).toBe(3);
        expect(item.durationMs).toBe(3000);
    });

    it('excludes muted layers', () => {
        const project = makeProject({
            assets: [audioAsset(1, 'clip.mp4')],
            scenes: [
                makeScene({
                    duration_ms: 2000,
                    layers: [videoLayer({ muted: true })],
                }),
            ],
        });

        expect(planProjectAudio(project)).toEqual([]);
    });

    it('crossfades scene audio across a transition', () => {
        const project = makeProject({
            assets: [audioAsset(1, 'clip.mp4')],
            scenes: [
                makeScene({
                    duration_ms: 2000,
                    transition: { type: 'fade', duration_ms: 600 },
                    layers: [videoLayer()],
                }),
                makeScene({
                    duration_ms: 2000,
                    layers: [videoLayer({ id: 'second' })],
                }),
            ],
        });

        const [first, second] = planProjectAudio(project);

        expect(first.fadeOutMs).toBe(600);
        expect(second.fadeInMs).toBe(600);
        expect(second.startMs).toBe(1400);
    });
});

describe('renderAudioPlan gain staging', () => {
    const item = (overrides: Partial<AudioPlanItem>): AudioPlanItem => ({
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
    });

    it('sums verbatim: every item keeps its own gain, with no division by input count', async () => {
        const { context, gains } = fakeContext(fakeBuffer([[0]]));
        const decode = vi.fn(async () => fakeBuffer([[1, 1, 1]]));

        await renderAudioPlan(
            [
                item({ id: 'a' }),
                item({ id: 'b' }),
                item({ id: 'c', gain: 0.5 }),
            ],
            1000,
            { createContext: () => context, decode },
        );

        expect(gains).toHaveLength(3);
        expect(gains.map((gain) => gain.events[0].value)).toEqual([1, 1, 0.5]);
        expect(gains.every((gain) => gain.connectedToDestination)).toBe(true);
    });

    it('applies linear fades around the flat gain', async () => {
        const { context, gains } = fakeContext(fakeBuffer([[0]]));

        await renderAudioPlan(
            [
                item({
                    startMs: 1000,
                    durationMs: 2000,
                    fadeInMs: 500,
                    fadeOutMs: 500,
                }),
            ],
            3000,
            {
                createContext: () => context,
                decode: async () => fakeBuffer([[1, 1, 1]]),
            },
        );

        expect(gains[0].events).toEqual([
            { type: 'set', value: 0, time: 1 },
            { type: 'ramp', value: 1, time: 1.5 },
            { type: 'set', value: 1, time: 2.5 },
            { type: 'ramp', value: 0, time: 3 },
        ]);
    });

    it('bounds each item to its timeline slot and applies speed as a playback rate', async () => {
        const { context, sources } = fakeContext(fakeBuffer([[0]]));

        await renderAudioPlan(
            [item({ startMs: 500, durationMs: 1500, speed: 2 })],
            3000,
            {
                createContext: () => context,
                decode: async () => fakeBuffer([[1, 1, 1]]),
            },
        );

        expect(sources[0].start).toBe(0.5);
        expect(sources[0].stop).toBe(2);
        expect(sources[0].playbackRate).toBe(2);
    });

    it('returns null when nothing decodes, so no empty audio track is added', async () => {
        const { context } = fakeContext(fakeBuffer([[0]]));

        await expect(
            renderAudioPlan([item({})], 1000, {
                createContext: () => context,
                decode: async () => null,
            }),
        ).resolves.toBeNull();
    });

    it('returns null for an empty plan or a zero-length project', async () => {
        const { context } = fakeContext(fakeBuffer([[0]]));
        const deps = {
            createContext: () => context,
            decode: async () => fakeBuffer([[1]]),
        };

        await expect(renderAudioPlan([], 1000, deps)).resolves.toBeNull();
        await expect(renderAudioPlan([item({})], 0, deps)).resolves.toBeNull();
    });
});

describe('applyPeakLimiter', () => {
    it('brings a summed overshoot down to the ceiling instead of dividing by input count', () => {
        // Two clips at full scale sum to 2.0; dividing by N would give 0.5.
        const buffer = fakeBuffer([new Array(200).fill(2)]);
        applyPeakLimiter(buffer);

        const data = buffer.getChannelData(0);
        expect(Math.max(...data)).toBeCloseTo(AUDIO_PEAK_CEILING, 5);
        expect(data[0]).toBeCloseTo(AUDIO_PEAK_CEILING, 5);
    });

    it('leaves a mix that already fits completely untouched', () => {
        const buffer = fakeBuffer([[0.5, -0.5, 0.9, -0.9]]);
        applyPeakLimiter(buffer);

        [0.5, -0.5, 0.9, -0.9].forEach((expected, index) => {
            expect(buffer.getChannelData(0)[index]).toBeCloseTo(expected, 6);
        });
    });

    it('never overshoots on an instant transient', () => {
        const buffer = fakeBuffer([[0.1, 4, 0.1, 0.1]]);
        applyPeakLimiter(buffer);

        for (const sample of buffer.getChannelData(0)) {
            expect(Math.abs(sample)).toBeLessThanOrEqual(
                AUDIO_PEAK_CEILING + 1e-6,
            );
        }
    });

    it('applies one shared gain across channels so the stereo image holds', () => {
        const buffer = fakeBuffer([
            [2, 2],
            [1, 1],
        ]);
        applyPeakLimiter(buffer);

        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);
        expect(left[0] / right[0]).toBeCloseTo(2, 5);
    });
});

describe('sliceAudioBuffer', () => {
    it('cuts a gapless sequence of pieces covering the whole mix', () => {
        const buffer = fakeBuffer([[1, 2, 3, 4, 5]]);
        const create = (channels: number, frames: number) =>
            fakeBuffer(
                Array.from({ length: channels }, () =>
                    new Array(frames).fill(0),
                ),
            );

        const first = sliceAudioBuffer(buffer, 0, 2, create);
        const second = sliceAudioBuffer(buffer, 2, 2, create);
        const third = sliceAudioBuffer(buffer, 4, 2, create);

        expect([...first.getChannelData(0)]).toEqual([1, 2]);
        expect([...second.getChannelData(0)]).toEqual([3, 4]);
        expect([...third.getChannelData(0)]).toEqual([5]);
    });
});
