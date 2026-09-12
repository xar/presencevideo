import { mediaLimits } from './editor-features';

const waveformCache = new Map<string, number[] | null>();
const frameBlobCache = new Map<string, string | null>();

/**
 * Frame extraction is expensive (seconds per filmstrip on files WebCodecs
 * cannot decode), so extracted frames are persisted in IndexedDB and reused
 * across page reloads. IndexedDB (unlike the Cache API) also works on
 * insecure origins like http://*.test. All failures degrade to "no cache".
 */
const IDB_NAME = 'editor-media-cache';
const IDB_STORE = 'frames';

let idbPromise: Promise<IDBDatabase | null> | null = null;

function openFrameDb(): Promise<IDBDatabase | null> {
    idbPromise ??= new Promise((resolve) => {
        try {
            const request = indexedDB.open(IDB_NAME, 1);
            request.onupgradeneeded = () => request.result.createObjectStore(IDB_STORE);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });

    return idbPromise;
}

async function idbGetFrame(key: string): Promise<Blob | null> {
    const db = await openFrameDb();
    if (!db) return null;

    return new Promise((resolve) => {
        try {
            const request = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
            request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
            request.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
}

async function idbPutFrame(key: string, blob: Blob): Promise<void> {
    const db = await openFrameDb();
    if (!db) return;

    try {
        db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).put(blob, key);
    } catch {
        // Quota or transaction failure: caching is best-effort.
    }
}

export async function getCachedWaveform(url: string, bars = mediaLimits.waveformBars): Promise<number[] | null> {
    const key = `${url}:${bars}`;

    if (waveformCache.has(key)) {
        return waveformCache.get(key) ?? null;
    }

    const { generateAudioWaveform } = await import('./mediabunny');
    const waveform = await generateAudioWaveform(url, bars).catch(() => null);
    const peaks = waveform?.peaks ?? null;
    waveformCache.set(key, peaks);

    return peaks;
}

export async function getCachedFramePreviewUrl(
    url: string,
    timestampSeconds: number,
    width = mediaLimits.previewFrameWidth,
): Promise<string | null> {
    const roundedTimestamp = Math.max(0, Math.round(timestampSeconds * 4) / 4);
    const key = `${url}:${roundedTimestamp}:${width}`;

    if (frameBlobCache.has(key)) {
        return frameBlobCache.get(key) ?? null;
    }

    const persisted = await idbGetFrame(key);
    if (persisted) {
        const objectUrl = URL.createObjectURL(persisted);
        frameBlobCache.set(key, objectUrl);
        return objectUrl;
    }

    const { createVideoFrameBlob } = await import('./mediabunny');
    const blob = await createVideoFrameBlob(url, roundedTimestamp, width).catch(() => null);
    const objectUrl = blob ? URL.createObjectURL(blob) : null;
    frameBlobCache.set(key, objectUrl);

    if (blob) {
        void idbPutFrame(key, blob);
    }

    return objectUrl;
}

/**
 * Batch variant used by filmstrips (scene thumbnails, timeline clips): serves
 * every frame it can from the persistent cache and decodes only the missing
 * ones in a single mediabunny pass.
 */
export async function getCachedFrameBlobs(
    url: string,
    timestampsSeconds: number[],
    width: number,
): Promise<Array<Blob | null>> {
    const keys = timestampsSeconds.map(
        (t) => `${url}:${Math.max(0, Math.round(t * 4) / 4)}:${width}`,
    );

    const cached = await Promise.all(keys.map(idbGetFrame));
    if (cached.every((blob) => blob !== null)) {
        return cached;
    }

    const { createVideoFrameBlobs } = await import('./mediabunny');
    const blobs = await createVideoFrameBlobs(url, timestampsSeconds, width).catch(
        () => timestampsSeconds.map(() => null),
    );

    blobs.forEach((blob, index) => {
        if (blob) {
            void idbPutFrame(keys[index], blob);
        }
    });

    return blobs;
}

export function clearMediaObjectUrlCache(): void {
    for (const objectUrl of frameBlobCache.values()) {
        if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
        }
    }

    frameBlobCache.clear();
}
