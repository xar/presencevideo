import { describe, expect, it, vi } from 'vitest';
import type { Project } from '@/types';
import type { Canvas2D } from '../compositor/context';
import {
    exportFrameCount,
    exportProjectVideo,
    frameMediaRequests,
    localExportSupport,
    LocalExportError
    
    
} from '../local-export';
import type {ExportEncoder, LocalExportDeps} from '../local-export';
import type { MediaCapabilities } from '../media-capabilities';
import type { ExportMediaLookup, ExportMediaRequest } from '../media-lookup';
import type { CompositedFrame } from '../model/frame';
import { resolveFrame } from '../model/resolve-frame';
import { totalDurationMs } from '../model/timeline';
import { makeProject, makeScene, makeTextLayer } from './fixtures';

const capable: MediaCapabilities = {
    canUseWebCodecs: true,
    canUseOffscreenCanvas: true,
    canReadLocalFiles: true,
    canCreateObjectUrls: true,
    canExportPreview: true,
    canCompressVideo: true,
};

type Recorder = {
    deps: LocalExportDeps;
    encoder: ExportEncoder & {
        videoFrames: { timestampSec: number; durationSec: number }[];
        audioChunks: number[];
        settled: boolean[];
    };
    prepared: ExportMediaRequest[][];
    drawn: CompositedFrame[];
};

/**
 * An export harness whose encoder resolves its `add` promises on a later
 * microtask, so a missing `await` in the frame loop shows up as an
 * unacknowledged frame rather than passing silently.
 */
function recorder(overrides: Partial<LocalExportDeps> = {}): Recorder {
    const videoFrames: { timestampSec: number; durationSec: number }[] = [];
    const audioChunks: number[] = [];
    const settled: boolean[] = [];
    const prepared: ExportMediaRequest[][] = [];
    const drawn: CompositedFrame[] = [];

    const encoder = {
        hasAudio: true,
        warnings: [] as string[],
        videoFrames,
        audioChunks,
        settled,
        addVideoFrame: async (timestampSec: number, durationSec: number) => {
            const index = settled.length;
            settled.push(false);
            videoFrames.push({ timestampSec, durationSec });
            await Promise.resolve();
            settled[index] = true;
        },
        addAudioChunk: async (buffer: AudioBuffer) => {
            audioChunks.push(buffer.length);
            await Promise.resolve();
        },
        finish: async () => new Blob(['mp4'], { type: 'video/mp4' }),
        abort: async () => undefined,
    };

    const lookup: ExportMediaLookup = {
        undecodable: new Set<string>(),
        prepare: async (requests) => {
            prepared.push([...requests]);
        },
        getImage: () => null,
        getVideoFrame: () => null,
        dispose: async () => undefined,
    };

    const deps: LocalExportDeps = {
        capabilities: () => capable,
        createCanvas: () => ({
            canvas: {} as OffscreenCanvas,
            ctx: {} as Canvas2D,
        }),
        createEncoder: async () => encoder,
        createLookup: () => lookup,
        mixAudio: async () => null,
        sliceAudio: (buffer, startFrame, frameCount) =>
            ({
                length: Math.min(frameCount, buffer.length - startFrame),
            }) as AudioBuffer,
        draw: (_ctx, frame) => {
            drawn.push(frame);
        },
        ...overrides,
    };

    return { deps, encoder, prepared, drawn };
}

describe('exportFrameCount', () => {
    it('derives frames from the transition-aware duration', () => {
        expect(exportFrameCount(2000, 30)).toBe(60);
        expect(exportFrameCount(0, 30)).toBe(0);
        expect(exportFrameCount(1000, 0)).toBe(30);
    });
});

describe('localExportSupport', () => {
    it('explains the missing capability instead of just refusing', () => {
        const noCodecs = localExportSupport({
            ...capable,
            canUseWebCodecs: false,
        });
        expect(noCodecs.supported).toBe(false);
        expect(noCodecs.reason).toMatch(/WebCodecs/);

        const noCanvas = localExportSupport({
            ...capable,
            canUseOffscreenCanvas: false,
        });
        expect(noCanvas.supported).toBe(false);
        expect(noCanvas.reason).toMatch(/OffscreenCanvas/);

        expect(localExportSupport(capable)).toEqual({
            supported: true,
            reason: null,
        });
    });
});

describe('exportProjectVideo frame loop', () => {
    it('encodes one frame per fps step over the whole duration', async () => {
        const project = makeProject({
            fps: 10,
            scenes: [makeScene({ duration_ms: 1000 })],
        });
        const { deps, encoder } = recorder();

        const result = await exportProjectVideo(project, { deps });

        expect(result.frameCount).toBe(10);
        expect(encoder.videoFrames).toHaveLength(10);
        expect(encoder.videoFrames[0]).toEqual({
            timestampSec: 0,
            durationSec: 0.1,
        });
        expect(encoder.videoFrames[9].timestampSec).toBeCloseTo(0.9, 6);
    });

    it('shortens the export by the transition overlap rather than summing scenes', async () => {
        const withTransition = makeProject({
            fps: 10,
            scenes: [
                makeScene({
                    duration_ms: 2000,
                    transition: { type: 'fade', duration_ms: 500 },
                }),
                makeScene({ duration_ms: 2000 }),
            ],
        });

        const naiveFrames = exportFrameCount(4000, 10);
        const { deps, encoder } = recorder();
        const result = await exportProjectVideo(withTransition, { deps });

        expect(totalDurationMs(withTransition)).toBe(3500);
        expect(result.frameCount).toBe(35);
        expect(result.frameCount).toBeLessThan(naiveFrames);
        expect(encoder.videoFrames).toHaveLength(35);
    });

    it('awaits encoder backpressure on every frame', async () => {
        const project = makeProject({
            fps: 5,
            scenes: [makeScene({ duration_ms: 1000 })],
        });
        const { deps, encoder } = recorder();

        await exportProjectVideo(project, { deps });

        expect(encoder.settled).toHaveLength(5);
        expect(encoder.settled.every(Boolean)).toBe(true);
    });

    it('prepares media before painting each frame', async () => {
        const project = makeProject({
            fps: 4,
            scenes: [makeScene({ duration_ms: 1000 })],
        });
        const { deps, prepared, drawn } = recorder();

        await exportProjectVideo(project, { deps });

        expect(prepared).toHaveLength(4);
        expect(drawn).toHaveLength(4);
        expect(drawn.map((frame) => Math.round(frame.primary.timeMs))).toEqual([
            0, 250, 500, 750,
        ]);
    });

    it('reports true frame progress', async () => {
        const project = makeProject({
            fps: 4,
            scenes: [makeScene({ duration_ms: 1000 })],
        });
        const { deps } = recorder();
        const progress: number[] = [];

        await exportProjectVideo(project, {
            deps,
            onProgress: ({ frameIndex, totalFrames, percent }) => {
                if (totalFrames > 0) {
                    progress.push(frameIndex);
                }
                expect(percent).toBeLessThanOrEqual(100);
            },
        });

        expect(progress).toEqual([0, 1, 2, 3, 4, 4]);
    });

    it('disposes the lookup even when encoding fails', async () => {
        const dispose = vi.fn(async () => undefined);
        const abort = vi.fn(async () => undefined);
        const base = recorder();
        const { deps } = recorder({
            createLookup: () => ({ ...base.deps.createLookup(), dispose }),
            createEncoder: async () => ({
                ...base.encoder,
                abort,
                addVideoFrame: async () => {
                    throw new Error('encoder died');
                },
            }),
        });

        await expect(
            exportProjectVideo(
                makeProject({
                    fps: 2,
                    scenes: [makeScene({ duration_ms: 1000 })],
                }),
                { deps },
            ),
        ).rejects.toThrow('encoder died');

        expect(dispose).toHaveBeenCalledTimes(1);
        expect(abort).toHaveBeenCalledTimes(1);
    });
});

describe('exportProjectVideo audio', () => {
    it('feeds the mix gaplessly, interleaved with the video clock', async () => {
        const project = makeProject({
            fps: 10,
            scenes: [makeScene({ duration_ms: 3000 })],
        });
        const mix = { length: 3 * 48000, sampleRate: 48000 } as AudioBuffer;
        const { deps, encoder } = recorder({ mixAudio: async () => mix });

        const result = await exportProjectVideo(project, { deps });

        expect(result.hasAudio).toBe(true);
        expect(encoder.audioChunks).toEqual([48000, 48000, 48000]);
    });

    it('drops the audio when the encoder has no audio track', async () => {
        const project = makeProject({
            fps: 5,
            scenes: [makeScene({ duration_ms: 1000 })],
        });
        const base = recorder();
        const { deps, encoder } = recorder({
            mixAudio: async () =>
                ({ length: 48000, sampleRate: 48000 }) as AudioBuffer,
            createEncoder: async () => ({
                ...base.encoder,
                hasAudio: false,
                warnings: ['no aac'],
            }),
        });

        const result = await exportProjectVideo(project, { deps });

        expect(result.hasAudio).toBe(false);
        expect(result.warnings).toContain('no aac');
        expect(encoder.audioChunks).toEqual([]);
    });

    it('exports silently rather than failing when the mix throws', async () => {
        const project = makeProject({
            fps: 5,
            scenes: [makeScene({ duration_ms: 1000 })],
        });
        const { deps } = recorder({
            mixAudio: async () => {
                throw new Error('decode failed');
            },
        });

        const result = await exportProjectVideo(project, { deps });

        expect(result.hasAudio).toBe(false);
        expect(
            result.warnings.some((warning) => warning.includes('silent')),
        ).toBe(true);
    });
});

describe('exportProjectVideo guards', () => {
    it('refuses with a readable message when the browser cannot encode', async () => {
        const { deps } = recorder({
            capabilities: () => ({ ...capable, canUseWebCodecs: false }),
        });

        await expect(
            exportProjectVideo(makeProject(), { deps }),
        ).rejects.toBeInstanceOf(LocalExportError);
    });

    it('refuses a project with no duration', async () => {
        const { deps } = recorder();
        const empty = makeProject({ scenes: [] });

        await expect(exportProjectVideo(empty, { deps })).rejects.toThrow(
            /no duration/i,
        );
    });

    it('refuses a missing project', async () => {
        const { deps } = recorder();

        await expect(exportProjectVideo(null, { deps })).rejects.toBeInstanceOf(
            LocalExportError,
        );
    });

    it('reports an undecodable asset as a warning instead of throwing', async () => {
        const project = makeProject({
            fps: 2,
            scenes: [makeScene({ duration_ms: 1000 })],
        });
        const base = recorder();
        const { deps } = recorder({
            createLookup: () => ({
                ...base.deps.createLookup(),
                undecodable: new Set(['broken.mp4']),
            }),
        });

        const result = await exportProjectVideo(project, { deps });

        expect(
            result.warnings.some((warning) => warning.includes('broken.mp4')),
        ).toBe(true);
    });
});

describe('frameMediaRequests', () => {
    it('collects both sides of a transition and marks stills as timeless', () => {
        const project: Project = makeProject({
            fps: 10,
            assets: [
                {
                    id: 7,
                    user_id: 1,
                    project_id: 1,
                    type: 'video',
                    source: 'upload',
                    name: 'a',
                    path: 'a',
                    disk: 'local',
                    mime_type: 'video/mp4',
                    size_bytes: 1,
                    duration_ms: 10000,
                    width: 100,
                    height: 100,
                    thumbnail_path: null,
                    metadata: {},
                    created_at: '',
                    updated_at: '',
                    url: 'a.mp4',
                },
            ],
            scenes: [
                makeScene({
                    duration_ms: 2000,
                    transition: { type: 'fade', duration_ms: 500 },
                    layers: [
                        {
                            id: 'v1',
                            type: 'video',
                            asset_id: 7,
                            x: 0,
                            y: 0,
                            width: 100,
                            height: 100,
                            z_index: 0,
                        },
                    ],
                }),
                makeScene({ duration_ms: 2000, layers: [makeTextLayer()] }),
            ],
        });

        const frame = resolveFrame(project, 1800);

        expect(frame.transition).toBeTruthy();
        expect(frameMediaRequests(frame)).toEqual([
            { url: 'a.mp4', timeSec: 1.8 },
        ]);
    });
});
