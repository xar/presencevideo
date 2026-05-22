import { mediaLimits } from './editor-features';

const waveformCache = new Map<string, number[] | null>();
const frameBlobCache = new Map<string, string | null>();

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

    const { createVideoFrameBlob } = await import('./mediabunny');
    const blob = await createVideoFrameBlob(url, roundedTimestamp, width).catch(() => null);
    const objectUrl = blob ? URL.createObjectURL(blob) : null;
    frameBlobCache.set(key, objectUrl);

    return objectUrl;
}

export function clearMediaObjectUrlCache(): void {
    for (const objectUrl of frameBlobCache.values()) {
        if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
        }
    }

    frameBlobCache.clear();
}
