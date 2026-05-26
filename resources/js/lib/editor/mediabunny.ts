import {
    ALL_FORMATS,
    AudioSampleSink,
    BlobSource,
    CanvasSink,
    UrlSource,
    Conversion,
    Input,
    Mp4OutputFormat,
    Output,
    QUALITY_LOW,
    BufferTarget,
} from 'mediabunny';

export type MediaMetadata = {
    durationMs: number | null;
    width: number | null;
    height: number | null;
    rotation: number | null;
    hasVideo: boolean;
    hasAudio: boolean;
    sampleRate: number | null;
    channels: number | null;
};

export type Waveform = {
    peaks: number[];
    durationMs: number | null;
};

export async function readMediaMetadata(file: File): Promise<MediaMetadata> {
    const input = createInput(file);
    const [duration, videoTrack, audioTrack] = await Promise.all([
        input.computeDuration().catch(() => null),
        input.getPrimaryVideoTrack().catch(() => null),
        input.getPrimaryAudioTrack().catch(() => null),
    ]);

    const [width, height, rotation] = videoTrack
        ? await Promise.all([
              videoTrack.getDisplayWidth().catch(() => null),
              videoTrack.getDisplayHeight().catch(() => null),
              videoTrack.getRotation().catch(() => null),
          ])
        : [null, null, null];

    const [sampleRate, channels] = audioTrack
        ? await Promise.all([
              audioTrack.getSampleRate().catch(() => null),
              audioTrack.getNumberOfChannels().catch(() => null),
          ])
        : [null, null];

    return {
        durationMs: duration === null ? null : Math.round(duration * 1000),
        width,
        height,
        rotation,
        hasVideo: Boolean(videoTrack),
        hasAudio: Boolean(audioTrack),
        sampleRate,
        channels,
    };
}

export async function createVideoThumbnail(file: File, width = 320): Promise<Blob | null> {
    const input = createInput(file);
    const videoTrack = await input.getPrimaryVideoTrack().catch(() => null);

    if (!videoTrack || !(await videoTrack.canDecode().catch(() => false))) {
        return null;
    }

    const duration = await videoTrack.computeDuration().catch(() => null);
    const firstTimestamp = await videoTrack.getFirstTimestamp().catch(() => 0);
    const timestamp = duration ? firstTimestamp + Math.min(Math.max(duration * 0.15, 0.1), 1) : firstTimestamp;
    const sink = new CanvasSink(videoTrack, { width });
    const result = await sink.getCanvas(timestamp);

    return result ? canvasToBlob(result.canvas, 'image/jpeg', 0.82) : null;
}

export async function createVideoFrameBlob(url: string, timestampSeconds: number, width = 640): Promise<Blob | null> {
    const blobs = await createVideoFrameBlobs(url, [timestampSeconds], width);

    return blobs[0] ?? null;
}

export async function createVideoFrameBlobs(url: string, timestampsSeconds: number[], width = 640): Promise<Array<Blob | null>> {
    const sourceUrl = toCurrentOriginUrl(url);

    console.groupCollapsed('[mediabunny] createVideoFrameBlobs');
    console.info('source', { originalUrl: url, sourceUrl, timestampsSeconds, width });

    try {
        await logUrlDiagnostics(sourceUrl);

        const input = new Input({ source: createUrlSource(sourceUrl), formats: ALL_FORMATS });
        const canRead = await input.canRead().catch((error) => {
            console.error('input.canRead() failed', error);

            return false;
        });
        console.info('input.canRead()', canRead);

        const videoTrack = await input.getPrimaryVideoTrack().catch((error) => {
            console.error('getPrimaryVideoTrack() failed', error);

            return null;
        });
        console.info('videoTrack found', Boolean(videoTrack));

        if (!videoTrack) {
            return timestampsSeconds.map(() => null);
        }

        const [codec, decoderConfig, canDecode] = await Promise.all([
            videoTrack.getCodec().catch((error) => {
                console.error('getCodec() failed', error);

                return null;
            }),
            videoTrack.getDecoderConfig().catch((error) => {
                console.error('getDecoderConfig() failed', error);

                return null;
            }),
            videoTrack.canDecode().catch((error) => {
                console.error('canDecode() failed', error);

                return false;
            }),
        ]);
        console.info('videoTrack decode info', { codec, decoderConfig, canDecode });

        if (!canDecode) {
            console.warn('Mediabunny/WebCodecs cannot decode this video track; falling back to HTMLVideoElement canvas capture.');

            return createVideoFrameBlobsFromHtmlVideo(sourceUrl, timestampsSeconds, width);
        }

        const [firstTimestamp, duration, displayWidth, displayHeight] = await Promise.all([
            videoTrack.getFirstTimestamp().catch((error) => {
                console.error('getFirstTimestamp() failed', error);

                return 0;
            }),
            videoTrack.computeDuration().catch((error) => {
                console.error('computeDuration() failed', error);

                return null;
            }),
            videoTrack.getDisplayWidth().catch(() => null),
            videoTrack.getDisplayHeight().catch(() => null),
        ]);
        const lastTimestamp = duration === null ? null : firstTimestamp + duration;
        const safeTimestamps = timestampsSeconds.map((timestamp) => {
            const minimum = firstTimestamp + 0.001;
            const maximum = lastTimestamp === null ? timestamp : Math.max(minimum, lastTimestamp - 0.001);

            return Math.min(Math.max(timestamp, minimum), maximum);
        });
        console.info('videoTrack timing', { firstTimestamp, duration, lastTimestamp, displayWidth, displayHeight, safeTimestamps });

        const sink = new CanvasSink(videoTrack, { width });
        const blobs: Array<Blob | null> = [];
        let index = 0;

        for await (const result of sink.canvasesAtTimestamps(safeTimestamps, { verifyKeyPackets: true })) {
            console.info('canvasesAtTimestamps result', { index, timestamp: safeTimestamps[index], hasCanvas: Boolean(result), resultTimestamp: result?.timestamp });

            if (result) {
                blobs.push(await canvasToBlob(result.canvas, 'image/jpeg', 0.82));
            } else {
                const fallback = await sink.getCanvas(safeTimestamps[index], { verifyKeyPackets: true }).catch((error) => {
                    console.error('getCanvas() fallback failed', { index, timestamp: safeTimestamps[index], error });

                    return null;
                });
                console.info('getCanvas() fallback result', { index, timestamp: safeTimestamps[index], hasCanvas: Boolean(fallback), resultTimestamp: fallback?.timestamp });
                blobs.push(fallback ? await canvasToBlob(fallback.canvas, 'image/jpeg', 0.82) : null);
            }

            index++;
        }

        console.info('sparse blobs', blobs.map(Boolean));

        if (blobs.some(Boolean)) {
            return timestampsSeconds.map((_, resultIndex) => blobs[resultIndex] ?? null);
        }

        const sequentialBlobs = await createVideoFrameBlobsFromSequentialCanvases(videoTrack, safeTimestamps, width);
        console.info('sequential blobs', sequentialBlobs.map(Boolean));

        return sequentialBlobs;
    } catch (error) {
        console.error('createVideoFrameBlobs() failed', error);

        return timestampsSeconds.map(() => null);
    } finally {
        console.groupEnd();
    }
}

async function createVideoFrameBlobsFromHtmlVideo(url: string, timestampsSeconds: number[], width: number): Promise<Array<Blob | null>> {
    if (typeof document === 'undefined' || timestampsSeconds.length === 0) {
        return timestampsSeconds.map(() => null);
    }

    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    try {
        await waitForVideoMetadata(video);

        const ratio = video.videoHeight > 0 ? video.videoWidth / video.videoHeight : 16 / 9;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = Math.max(1, Math.round(width / ratio));
        const context = canvas.getContext('2d');

        if (!context) {
            return timestampsSeconds.map(() => null);
        }

        const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
        const blobs: Array<Blob | null> = [];

        for (const timestamp of timestampsSeconds) {
            const safeTimestamp = duration === null ? Math.max(0, timestamp) : Math.min(Math.max(0, timestamp), Math.max(0, duration - 0.001));

            try {
                await seekVideo(video, safeTimestamp);
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                blobs.push(await canvasToBlob(canvas, 'image/jpeg', 0.82));
            } catch (error) {
                console.error('HTMLVideoElement thumbnail capture failed', { timestamp: safeTimestamp, error });
                blobs.push(null);
            }
        }

        console.info('html video fallback blobs', blobs.map(Boolean));

        return blobs;
    } catch (error) {
        console.error('HTMLVideoElement fallback failed', error);

        return timestampsSeconds.map(() => null);
    } finally {
        video.removeAttribute('src');
        video.load();
    }
}

function waitForVideoMetadata(video: HTMLVideoElement): Promise<void> {
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const cleanup = () => {
            video.removeEventListener('loadedmetadata', handleLoadedMetadata);
            video.removeEventListener('error', handleError);
        };
        const handleLoadedMetadata = () => {
            cleanup();
            resolve();
        };
        const handleError = () => {
            cleanup();
            reject(video.error ?? new Error('Unable to load video metadata.'));
        };

        video.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
        video.addEventListener('error', handleError, { once: true });
        video.load();
    });
}

function seekVideo(video: HTMLVideoElement, timestampSeconds: number): Promise<void> {
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            video.removeEventListener('seeked', handleSeeked);
            video.removeEventListener('error', handleError);
        };
        const handleSeeked = () => {
            cleanup();
            resolve();
        };
        const handleError = () => {
            cleanup();
            reject(video.error ?? new Error('Unable to seek video.'));
        };

        video.addEventListener('seeked', handleSeeked, { once: true });
        video.addEventListener('error', handleError, { once: true });
        video.currentTime = timestampSeconds;
    });
}

async function createVideoFrameBlobsFromSequentialCanvases(videoTrack: Awaited<ReturnType<Input['getPrimaryVideoTrack']>>, timestampsSeconds: number[], width: number): Promise<Array<Blob | null>> {
    if (!videoTrack || timestampsSeconds.length === 0) {
        return timestampsSeconds.map(() => null);
    }

    const sink = new CanvasSink(videoTrack, { width });
    const startTimestamp = Math.max(0, timestampsSeconds[0] - 0.25);
    const endTimestamp = timestampsSeconds[timestampsSeconds.length - 1] + 0.25;
    const candidates: Array<{ timestamp: number; blob: Blob }> = [];

    for await (const result of sink.canvases(startTimestamp, endTimestamp, { verifyKeyPackets: true })) {
        const blob = await canvasToBlob(result.canvas, 'image/jpeg', 0.82);

        if (blob) {
            candidates.push({ timestamp: result.timestamp, blob });
        }

        if (candidates.length >= Math.max(timestampsSeconds.length * 3, 12)) {
            break;
        }
    }

    return timestampsSeconds.map((timestamp) => {
        if (candidates.length === 0) {
            return null;
        }

        return candidates.reduce((nearest, candidate) => {
            return Math.abs(candidate.timestamp - timestamp) < Math.abs(nearest.timestamp - timestamp) ? candidate : nearest;
        }).blob;
    });
}

export async function generateAudioWaveform(fileOrUrl: File | string, bars = 96): Promise<Waveform | null> {
    const input = typeof fileOrUrl === 'string'
        ? new Input({ source: createUrlSource(fileOrUrl), formats: ALL_FORMATS })
        : createInput(fileOrUrl);

    const audioTrack = await input.getPrimaryAudioTrack().catch(() => null);
    if (!audioTrack || !(await audioTrack.canDecode().catch(() => false))) {
        return null;
    }

    const duration = await audioTrack.computeDuration().catch(() => null);
    const sink = new AudioSampleSink(audioTrack);
    const peaks = Array.from({ length: bars }, () => 0);

    for await (const sample of sink.samples()) {
        try {
            const buffer = sample.toAudioBuffer();
            const startRatio = duration ? sample.timestamp / duration : 0;
            const endRatio = duration ? (sample.timestamp + sample.duration) / duration : 1;
            const startBar = Math.max(0, Math.min(bars - 1, Math.floor(startRatio * bars)));
            const endBar = Math.max(startBar, Math.min(bars - 1, Math.ceil(endRatio * bars)));
            let peak = 0;

            for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
                const data = buffer.getChannelData(channel);
                for (let i = 0; i < data.length; i += 64) {
                    peak = Math.max(peak, Math.abs(data[i] ?? 0));
                }
            }

            for (let bar = startBar; bar <= endBar; bar++) {
                peaks[bar] = Math.max(peaks[bar], peak);
            }
        } finally {
            sample.close();
        }
    }

    const max = Math.max(...peaks, 0.01);

    return {
        peaks: peaks.map((peak) => peak / max),
        durationMs: duration === null ? null : Math.round(duration * 1000),
    };
}

export async function compressVideoForUpload(file: File, maxWidth = 1280): Promise<File | null> {
    if (!('VideoEncoder' in window) || !('VideoDecoder' in window)) {
        return null;
    }

    const input = createInput(file);
    const output = new Output({
        format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
        target: new BufferTarget(),
    });

    const conversion = await Conversion.init({
        input,
        output,
        tracks: 'primary',
        video: {
            width: maxWidth,
            bitrate: QUALITY_LOW,
        },
        audio: {
            bitrate: QUALITY_LOW,
        },
        tags: {},
    });

    if (!conversion.isValid) {
        return null;
    }

    await conversion.execute();

    if (!output.target.buffer) {
        return null;
    }

    return new File([output.target.buffer], replaceExtension(file.name, 'mp4'), { type: 'video/mp4' });
}

function createInput(file: File): Input {
    return new Input({
        source: new BlobSource(file),
        formats: ALL_FORMATS,
    });
}

function createUrlSource(url: string): UrlSource {
    return new UrlSource(toCurrentOriginUrl(url), {
        requestInit: {
            credentials: 'include',
        },
    });
}

async function logUrlDiagnostics(url: string): Promise<void> {
    if (typeof fetch === 'undefined') {
        return;
    }

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                Range: 'bytes=0-1023',
            },
            credentials: 'include',
        });

        console.info('range fetch diagnostics', {
            url,
            status: response.status,
            ok: response.ok,
            redirected: response.redirected,
            finalUrl: response.url,
            contentType: response.headers.get('content-type'),
            contentLength: response.headers.get('content-length'),
            contentRange: response.headers.get('content-range'),
            acceptRanges: response.headers.get('accept-ranges'),
        });

        await response.body?.cancel();
    } catch (error) {
        console.error('range fetch diagnostics failed', error);
    }
}

function toCurrentOriginUrl(url: string): string {
    if (typeof window === 'undefined') {
        return url;
    }

    const parsedUrl = new URL(url, window.location.href);

    if (parsedUrl.hostname === window.location.hostname) {
        parsedUrl.protocol = window.location.protocol;
        parsedUrl.port = window.location.port;
    }

    return parsedUrl.toString();
}

async function canvasToBlob(canvas: HTMLCanvasElement | OffscreenCanvas, type: string, quality: number): Promise<Blob | null> {
    if ('convertToBlob' in canvas) {
        return canvas.convertToBlob({ type, quality });
    }

    return new Promise((resolve) => {
        canvas.toBlob(resolve, type, quality);
    });
}

function replaceExtension(name: string, extension: string): string {
    return name.replace(/\.[^.]+$/, '') + `.${extension}`;
}
