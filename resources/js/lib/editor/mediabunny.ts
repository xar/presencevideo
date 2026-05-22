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
    const input = new Input({ source: new UrlSource(url), formats: ALL_FORMATS });
    const videoTrack = await input.getPrimaryVideoTrack().catch(() => null);

    if (!videoTrack || !(await videoTrack.canDecode().catch(() => false))) {
        return null;
    }

    const sink = new CanvasSink(videoTrack, { width });
    const result = await sink.getCanvas(timestampSeconds);

    return result ? canvasToBlob(result.canvas, 'image/jpeg', 0.85) : null;
}

export async function generateAudioWaveform(fileOrUrl: File | string, bars = 96): Promise<Waveform | null> {
    const input = typeof fileOrUrl === 'string'
        ? new Input({ source: new UrlSource(fileOrUrl), formats: ALL_FORMATS })
        : createInput(fileOrUrl);

    const audioTrack = await input.getPrimaryAudioTrack().catch(() => null);
    if (!audioTrack || !(await audioTrack.canDecode().catch(() => false))) {
        return null;
    }

    const duration = await audioTrack.computeDuration().catch(() => null);
    const sink = new AudioSampleSink(audioTrack);
    const peaks = Array.from({ length: bars }, () => 0);

    for await (const sample of sink.samples()) {
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
