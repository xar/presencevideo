import { beforeEach, describe, expect, it, vi } from 'vitest';

const acquireMediaProvider = vi.hoisted(() => vi.fn());

vi.mock('../media-provider', () => ({
    acquireMediaProvider,
    toCurrentOriginUrl: (url: string) => url,
}));

import { mediaLimits } from '../editor-features';
import { createPreviewMediaLookup } from '../media-lookup';

type FakeFrame = {
    source: CanvasImageSource;
    timestamp: number;
    duration: number;
};

/**
 * A decoded preview frame. The label doubles as the canvas identity, which is
 * what lets a test prove that two decodes are two DISTINCT canvases rather than
 * one recycled pool slot.
 */
function fakeSample(label: string): FakeFrame {
    return {
        source: { label } as unknown as CanvasImageSource,
        timestamp: 0,
        duration: 1 / 30,
    };
}

function fakeProvider(frames: Map<number, FakeFrame> = new Map()) {
    return {
        frames,
        isDecodePending: false,
        release: vi.fn(),
        requestFrame: vi.fn(),
        setPlaybackMode: vi.fn(),
        setPlayhead: vi.fn(),
        setPreviewSurface: vi.fn(),
        frameAt: vi.fn((timeSec: number) => frames.get(timeSec) ?? null),
    };
}

const readyImage = (url: string) => ({
    source: url as unknown as CanvasImageSource,
    ready: () => true,
});
const pendingImage = (url: string) => ({
    source: url as unknown as CanvasImageSource,
    ready: () => false,
});

beforeEach(() => {
    acquireMediaProvider.mockReset();
});

describe('createPreviewMediaLookup video frames', () => {
    it('returns the decoded frame on a cache hit', () => {
        const frame = fakeSample('frame-a');
        const provider = fakeProvider(new Map([[1.5, frame]]));
        acquireMediaProvider.mockReturnValue(provider);

        const lookup = createPreviewMediaLookup();
        expect(lookup.getVideoFrame('clip.mp4', 1.5)).toBe(frame.source);
        expect(provider.requestFrame).not.toHaveBeenCalled();
    });

    it('schedules a decode and returns null on the first miss', () => {
        const provider = fakeProvider();
        acquireMediaProvider.mockReturnValue(provider);

        const lookup = createPreviewMediaLookup();
        expect(lookup.getVideoFrame('clip.mp4', 2)).toBeNull();
        expect(provider.requestFrame).toHaveBeenCalledWith(2);
    });

    it('holds the previous frame through a later miss instead of flickering', () => {
        const frame = fakeSample('frame-1');
        const frames = new Map([[1, frame]]);
        const provider = fakeProvider(frames);
        acquireMediaProvider.mockReturnValue(provider);

        const lookup = createPreviewMediaLookup();
        expect(lookup.getVideoFrame('clip.mp4', 1)).toBe(frame.source);

        // Scrub to a time that has not been decoded yet.
        expect(lookup.getVideoFrame('clip.mp4', 9)).toBe(frame.source);
        expect(provider.requestFrame).toHaveBeenCalledWith(9);
    });

    it('replays the last frame when the element outlives its source', () => {
        const frame = fakeSample('last');
        const provider = fakeProvider(new Map([[3, frame]]));
        acquireMediaProvider.mockReturnValue(provider);

        const lookup = createPreviewMediaLookup();
        lookup.getVideoFrame('clip.mp4', 3);

        expect(lookup.getVideoFrame('clip.mp4', null)).toBe(frame.source);
        expect(provider.frameAt).toHaveBeenCalledTimes(1);
    });

    it('returns null for a held frame that was never decoded', () => {
        acquireMediaProvider.mockReturnValue(fakeProvider());
        const lookup = createPreviewMediaLookup();
        expect(lookup.getVideoFrame('clip.mp4', null)).toBeNull();
    });

    it('acquires one provider per url and reuses it', () => {
        acquireMediaProvider.mockImplementation(() => fakeProvider());

        const lookup = createPreviewMediaLookup();
        lookup.getVideoFrame('a.mp4', 0);
        lookup.getVideoFrame('a.mp4', 1);
        lookup.getVideoFrame('b.mp4', 0);

        expect(acquireMediaProvider).toHaveBeenCalledTimes(2);
    });
});

describe('createPreviewMediaLookup images', () => {
    it('returns the image only once it has pixels', () => {
        const lookup = createPreviewMediaLookup(pendingImage);
        expect(lookup.getImage('still.png')).toBeNull();
    });

    it('returns a loaded image and loads each url once', () => {
        const loader = vi.fn(readyImage);
        const lookup = createPreviewMediaLookup(loader);

        expect(lookup.getImage('still.png')).toBe('still.png');
        expect(lookup.getImage('still.png')).toBe('still.png');
        expect(loader).toHaveBeenCalledTimes(1);
    });

    it('does not retry a loader that returned nothing', () => {
        const loader = vi.fn(() => null);
        const lookup = createPreviewMediaLookup(loader);

        expect(lookup.getImage('still.png')).toBeNull();
        expect(lookup.getImage('still.png')).toBeNull();
        expect(loader).toHaveBeenCalledTimes(1);
    });
});

describe('createPreviewMediaLookup lifecycle', () => {
    it('releases providers whose urls are no longer needed', () => {
        const providers = new Map<string, ReturnType<typeof fakeProvider>>();
        acquireMediaProvider.mockImplementation((url: string) => {
            const provider = fakeProvider();
            providers.set(url, provider);
            return provider;
        });

        const lookup = createPreviewMediaLookup();
        lookup.sync(['a.mp4', 'b.mp4']);
        lookup.sync(['a.mp4']);

        expect(providers.get('b.mp4')!.release).toHaveBeenCalledTimes(1);
        expect(providers.get('a.mp4')!.release).not.toHaveBeenCalled();
    });

    it('drops the held frame of a released url so it cannot leak into a reuse', () => {
        acquireMediaProvider.mockImplementation(() =>
            fakeProvider(new Map([[0, fakeSample('old')]])),
        );

        const lookup = createPreviewMediaLookup();
        lookup.getVideoFrame('a.mp4', 0);
        lookup.sync([]);

        expect(lookup.getVideoFrame('a.mp4', null)).toBeNull();
    });

    it('acquires providers for newly needed urls', () => {
        acquireMediaProvider.mockImplementation(() => fakeProvider());

        const lookup = createPreviewMediaLookup();
        lookup.sync(['a.mp4', 'b.mp4']);

        expect(acquireMediaProvider).toHaveBeenCalledTimes(2);
    });

    it('releases everything on dispose', () => {
        const created: ReturnType<typeof fakeProvider>[] = [];
        acquireMediaProvider.mockImplementation(() => {
            const provider = fakeProvider();
            created.push(provider);
            return provider;
        });

        const lookup = createPreviewMediaLookup();
        lookup.sync(['a.mp4', 'b.mp4']);
        lookup.dispose();

        expect(created).toHaveLength(2);
        for (const provider of created) {
            expect(provider.release).toHaveBeenCalledTimes(1);
        }
    });
});

describe('createPreviewMediaLookup decode policy', () => {
    it('forwards the playback mode and the preview surface to every provider', () => {
        const providers = new Map<string, ReturnType<typeof fakeProvider>>();
        acquireMediaProvider.mockImplementation((url: string) => {
            const provider = fakeProvider();
            providers.set(url, provider);
            return provider;
        });

        const lookup = createPreviewMediaLookup();
        lookup.setPreviewSurface({ width: 530, height: 942 });
        lookup.sync(['a.mp4', 'b.mp4']);
        lookup.setPlaybackMode('playing');

        for (const provider of providers.values()) {
            expect(provider.setPlaybackMode).toHaveBeenCalledWith('playing');
            expect(provider.setPreviewSurface).toHaveBeenCalledWith({
                width: 530,
                height: 942,
            });
        }
    });

    it('applies the current mode and surface to a provider acquired later', () => {
        const providers = new Map<string, ReturnType<typeof fakeProvider>>();
        acquireMediaProvider.mockImplementation((url: string) => {
            const provider = fakeProvider();
            providers.set(url, provider);
            return provider;
        });

        const lookup = createPreviewMediaLookup();
        lookup.setPlaybackMode('playing');
        lookup.setPreviewSurface({ width: 640, height: 360 });
        lookup.getVideoFrame('late.mp4', 1);

        const provider = providers.get('late.mp4')!;
        expect(provider.setPlaybackMode).toHaveBeenCalledWith('playing');
        expect(provider.setPreviewSurface).toHaveBeenCalledWith({
            width: 640,
            height: 360,
        });
    });

    it('serves the frame object the provider currently owns, never a stale canvas', () => {
        // A pooled canvas would be the same object for two different frames.
        // The provider deliberately runs its preview sink without a pool, so
        // two decodes are two canvases, and the held frame keeps pointing at
        // the picture it was decoded from.
        const first = fakeSample('frame-1');
        const second = fakeSample('frame-2');
        const frames = new Map([[1, first]]);
        const provider = fakeProvider(frames);
        acquireMediaProvider.mockReturnValue(provider);

        const lookup = createPreviewMediaLookup();
        expect(lookup.getVideoFrame('clip.mp4', 1)).toBe(first.source);

        frames.set(2, second);
        expect(lookup.getVideoFrame('clip.mp4', 2)).toBe(second.source);
        expect(first.source).not.toBe(second.source);

        // The most recent decode is what a held frame replays.
        expect(lookup.getVideoFrame('clip.mp4', null)).toBe(second.source);
    });
});

describe('createPreviewMediaLookup warm-up', () => {
    function trackedProviders() {
        const providers = new Map<string, ReturnType<typeof fakeProvider>>();
        acquireMediaProvider.mockImplementation((url: string) => {
            const provider = fakeProvider();
            providers.set(url, provider);
            return provider;
        });

        return providers;
    }

    it('starts at most `concurrentPreviewDecoders` decodes', () => {
        const providers = trackedProviders();
        const lookup = createPreviewMediaLookup();

        lookup.warmUp([
            { url: 'a.mp4', timeSec: 0 },
            { url: 'b.mp4', timeSec: 0.5 },
            { url: 'c.mp4', timeSec: 1 },
            { url: 'd.mp4', timeSec: 1.5 },
            { url: 'e.mp4', timeSec: 2 },
        ]);

        const started = [...providers.values()].filter(
            (provider) => provider.requestFrame.mock.calls.length > 0,
        );

        expect(mediaLimits.concurrentPreviewDecoders).toBe(3);
        expect(started).toHaveLength(3);
        expect(providers.get('a.mp4')!.requestFrame).toHaveBeenCalledWith(0);
    });

    it('warms each url once, whatever the request list repeats', () => {
        const providers = trackedProviders();
        const lookup = createPreviewMediaLookup();

        lookup.warmUp([
            { url: 'a.mp4', timeSec: 0 },
            { url: 'a.mp4', timeSec: 4 },
        ]);

        expect(providers.get('a.mp4')!.requestFrame).toHaveBeenCalledTimes(1);
    });

    it('does not compete with a decode the user is already waiting on', () => {
        const busy = fakeProvider();
        busy.isDecodePending = true;
        acquireMediaProvider.mockReturnValue(busy);

        const lookup = createPreviewMediaLookup();
        lookup.warmUp([{ url: 'a.mp4', timeSec: 0 }]);

        expect(busy.requestFrame).not.toHaveBeenCalled();
    });

    it('ignores requests with no usable source time', () => {
        trackedProviders();
        const lookup = createPreviewMediaLookup();

        lookup.warmUp([{ url: 'a.mp4', timeSec: Number.NaN }]);

        expect(acquireMediaProvider).not.toHaveBeenCalled();
    });
});

describe('createPreviewMediaLookup playhead reporting', () => {
    it('reports the playhead on a cache HIT, where nothing else would', () => {
        const frame = fakeSample('frame-a');
        const provider = fakeProvider(new Map([[1.5, frame]]));
        acquireMediaProvider.mockReturnValue(provider);

        const lookup = createPreviewMediaLookup();
        lookup.getVideoFrame('clip.mp4', 1.5);

        // Without this the read-ahead horizon stops advancing exactly when the
        // cache is working, and playback freezes once it drains.
        expect(provider.setPlayhead).toHaveBeenCalledWith(1.5);
        expect(provider.requestFrame).not.toHaveBeenCalled();
    });

    it('still schedules a decode on a miss', () => {
        const provider = fakeProvider();
        acquireMediaProvider.mockReturnValue(provider);

        const lookup = createPreviewMediaLookup();
        lookup.getVideoFrame('clip.mp4', 2);

        expect(provider.requestFrame).toHaveBeenCalledWith(2);
    });
});
