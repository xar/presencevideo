import { beforeEach, describe, expect, it, vi } from 'vitest';

const acquireMediaProvider = vi.hoisted(() => vi.fn());

vi.mock('../media-provider', () => ({
    acquireMediaProvider,
    toCurrentOriginUrl: (url: string) => url,
}));

import { createExportMediaLookup } from '../media-lookup';

type FakeSample = {
    timestamp: number;
    duration: number;
    close: ReturnType<typeof vi.fn>;
    toCanvasImageSource: () => CanvasImageSource;
};

/** Every sample handed out by a fake provider, so leaks are assertable. */
function makeSamples(count: number, frameSec = 0.5): FakeSample[] {
    return Array.from({ length: count }, (_, index) => ({
        timestamp: index * frameSec,
        duration: frameSec,
        close: vi.fn(),
        toCanvasImageSource: () =>
            `frame-${index}` as unknown as CanvasImageSource,
    }));
}

/**
 * Mimics `MediaProvider.openSequential`: a forward-only stream over the given
 * samples, starting at the first sample covering `startSec`.
 */
function fakeProvider(
    samples: FakeSample[],
    overrides: Record<string, unknown> = {},
) {
    const opened: number[] = [];

    return {
        opened,
        release: vi.fn(),
        requestFrame: vi.fn(),
        frameAt: vi.fn(() => null),
        getAudioBuffers: vi.fn(),
        ready: vi.fn(async () => ({
            canDecode: true,
            fps: 2,
            durationSec: samples.length * 0.5,
            firstTimestampSec: 0,
            displayWidth: 320,
            displayHeight: 240,
            hasAudio: false,
            ...(overrides.readiness as object | undefined),
        })),
        openSequential: vi.fn(async function* (startSec: number) {
            opened.push(startSec);

            for (const sample of samples) {
                if (sample.timestamp + sample.duration <= startSec) {
                    continue;
                }

                yield sample;
            }
        }),
    };
}

beforeEach(() => {
    acquireMediaProvider.mockReset();
});

describe('createExportMediaLookup video', () => {
    it('advances monotonically and returns the sample covering each timestamp', async () => {
        const samples = makeSamples(4);
        acquireMediaProvider.mockReturnValue(fakeProvider(samples));

        const lookup = createExportMediaLookup();

        for (const [time, expected] of [
            [0, 'frame-0'],
            [0.4, 'frame-0'],
            [0.6, 'frame-1'],
            [1.2, 'frame-2'],
        ] as const) {
            await lookup.prepare([{ url: 'clip.mp4', timeSec: time }]);
            expect(lookup.getVideoFrame('clip.mp4', time)).toBe(expected);
        }

        await lookup.dispose();
    });

    it('closes every sample it passes exactly once', async () => {
        const samples = makeSamples(4);
        acquireMediaProvider.mockReturnValue(fakeProvider(samples));

        const lookup = createExportMediaLookup();

        for (const time of [0, 0.6, 1.2, 1.8]) {
            await lookup.prepare([{ url: 'clip.mp4', timeSec: time }]);
        }

        await lookup.dispose();

        for (const sample of samples) {
            expect(sample.close).toHaveBeenCalledTimes(1);
        }
    });

    it('never touches the preview cache or its decoder', async () => {
        const provider = fakeProvider(makeSamples(3));
        acquireMediaProvider.mockReturnValue(provider);

        const lookup = createExportMediaLookup();
        await lookup.prepare([{ url: 'clip.mp4', timeSec: 0 }]);
        await lookup.prepare([{ url: 'clip.mp4', timeSec: 1 }]);
        await lookup.dispose();

        expect(provider.frameAt).not.toHaveBeenCalled();
        expect(provider.requestFrame).not.toHaveBeenCalled();
        expect(provider.openSequential).toHaveBeenCalledTimes(1);
    });

    it('opens one sequential stream and reuses it across frames', async () => {
        const provider = fakeProvider(makeSamples(6));
        acquireMediaProvider.mockReturnValue(provider);

        const lookup = createExportMediaLookup();
        for (const time of [0, 0.5, 1, 1.5, 2]) {
            await lookup.prepare([{ url: 'clip.mp4', timeSec: time }]);
        }

        expect(provider.opened).toEqual([0]);
        await lookup.dispose();
    });

    it('reopens the stream when a later element needs an earlier source time', async () => {
        const provider = fakeProvider(makeSamples(6));
        acquireMediaProvider.mockReturnValue(provider);

        const lookup = createExportMediaLookup();
        await lookup.prepare([{ url: 'clip.mp4', timeSec: 2 }]);
        await lookup.prepare([{ url: 'clip.mp4', timeSec: 0 }]);

        expect(provider.opened).toEqual([2, 0]);
        expect(lookup.getVideoFrame('clip.mp4', 0)).toBe('frame-0');
        await lookup.dispose();
    });

    it('holds the last frame past the end of the source instead of going blank', async () => {
        const samples = makeSamples(2);
        acquireMediaProvider.mockReturnValue(fakeProvider(samples));

        const lookup = createExportMediaLookup();
        await lookup.prepare([{ url: 'clip.mp4', timeSec: 0.6 }]);
        await lookup.prepare([{ url: 'clip.mp4', timeSec: null }]);

        expect(lookup.getVideoFrame('clip.mp4', null)).toBe('frame-1');
        await lookup.dispose();
    });

    it('gives each simultaneous source time on one asset its own lane', async () => {
        const providers = [
            fakeProvider(makeSamples(6)),
            fakeProvider(makeSamples(6)),
        ];
        let index = 0;
        acquireMediaProvider.mockImplementation(
            () => providers[Math.min(index++, 1)],
        );

        const lookup = createExportMediaLookup();
        await lookup.prepare([
            { url: 'clip.mp4', timeSec: 0 },
            { url: 'clip.mp4', timeSec: 2 },
        ]);

        expect(lookup.getVideoFrame('clip.mp4', 0)).toBe('frame-0');
        expect(lookup.getVideoFrame('clip.mp4', 2)).toBe('frame-4');
        await lookup.dispose();
    });

    it('records an undecodable asset and keeps going instead of throwing', async () => {
        const provider = fakeProvider([], {
            readiness: { canDecode: false, durationSec: 0 },
        });
        acquireMediaProvider.mockReturnValue(provider);

        const lookup = createExportMediaLookup();
        await expect(
            lookup.prepare([{ url: 'broken.mp4', timeSec: 0 }]),
        ).resolves.toBeUndefined();

        expect(lookup.getVideoFrame('broken.mp4', 0)).toBeNull();
        expect([...lookup.undecodable]).toEqual(['broken.mp4']);
        expect(provider.release).toHaveBeenCalledTimes(1);
        await lookup.dispose();
    });

    it('releases every provider on dispose', async () => {
        const provider = fakeProvider(makeSamples(2));
        acquireMediaProvider.mockReturnValue(provider);

        const lookup = createExportMediaLookup();
        await lookup.prepare([{ url: 'clip.mp4', timeSec: 0 }]);
        await lookup.dispose();

        expect(provider.release).toHaveBeenCalledTimes(1);
    });
});

describe('createExportMediaLookup images', () => {
    it('waits for an image to load before the frame is painted', async () => {
        const loader = vi.fn(
            async (url: string) => url as unknown as CanvasImageSource,
        );
        const lookup = createExportMediaLookup(loader);

        await lookup.prepare([{ url: 'still.png', timeSec: null }]);

        expect(lookup.getImage('still.png')).toBe('still.png');
        expect(loader).toHaveBeenCalledTimes(1);
    });

    it('loads each image once across frames', async () => {
        const loader = vi.fn(
            async (url: string) => url as unknown as CanvasImageSource,
        );
        const lookup = createExportMediaLookup(loader);

        await lookup.prepare([{ url: 'still.png', timeSec: null }]);
        await lookup.prepare([{ url: 'still.png', timeSec: null }]);

        expect(loader).toHaveBeenCalledTimes(1);
    });

    it('marks an image that fails to load as undecodable without throwing', async () => {
        const lookup = createExportMediaLookup(async () => {
            throw new Error('404');
        });

        await lookup.prepare([{ url: 'gone.png', timeSec: null }]);

        expect(lookup.getImage('gone.png')).toBeNull();
        expect([...lookup.undecodable]).toEqual(['gone.png']);
    });
});
