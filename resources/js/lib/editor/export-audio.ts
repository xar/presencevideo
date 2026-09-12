import type { Asset, Project } from '@/types/editor';
import { decodeSourceRange as sharedDecodeSourceRange } from './audio-decode';
import { clampSpeed, clampVolume } from './clip-effects';
import { acquireMediaProvider } from './media-provider';
import {
    mapTimelineMs,
    resolveTransitions,
    sceneStartsMs,
} from './model/timeline';

/**
 * The browser export's audio stage.
 *
 * Everything here mirrors `FFmpegService::buildAudioMixFilter` and
 * `FFmpegService::buildSceneAudioFilter` deliberately: the same trims, the same
 * fades, the same transition-mapped positions and — most importantly — the same
 * GAIN STAGING. ffmpeg's `amix` defaults to `normalize=1`, which divides every
 * input by the number of inputs, so a project got quieter the more clips it
 * had and the per-clip volume the user set was silently contradicted. The
 * server now sums verbatim (`normalize=0`) and catches peaks with a brick-wall
 * limiter at 0.95; this module does exactly the same, so a browser export and a
 * server render are the same loudness.
 *
 * The plan (what plays, when, how loud) is a pure function of the project and
 * is tested as such; only the rendering stage touches Web Audio and decoders.
 */

/** Peak ceiling after the sum. Mirrors `FFmpegService::AUDIO_LIMITER`. */
export const AUDIO_PEAK_CEILING = 0.95;

/** Limiter recovery time. Mirrors ffmpeg's `alimiter` default release. */
export const AUDIO_LIMITER_RELEASE_SEC = 0.05;

/** Sample rate of the exported mix; the AAC encoder's natural rate. */
export const EXPORT_SAMPLE_RATE = 48000;

/** Channel count of the exported mix. */
export const EXPORT_CHANNELS = 2;

/**
 * One scheduled piece of source audio, positioned on the OUTPUT timeline.
 *
 * `speed` is expressed as a playback rate rather than baked into the source
 * range so the renderer can hand it straight to an `AudioBufferSourceNode`,
 * which is the Web Audio equivalent of the render's `atempo` chain.
 */
export type AudioPlanItem = {
    /** Identifies the item in tests and diagnostics. */
    id: string;
    url: string;
    assetId: number;
    /** Where this plays on the output timeline, transition overlap removed. */
    startMs: number;
    /** How long it plays for on the output timeline. */
    durationMs: number;
    /** First source second to take, after trim. */
    sourceStartSec: number;
    /** Last source second to take, after trim; the decode range's end. */
    sourceEndSec: number;
    /** Playback rate; >1 plays the source faster, as `atempo` does. */
    speed: number;
    /** Linear gain, already the product of clip/layer and track volume. */
    gain: number;
    fadeInMs: number;
    fadeOutMs: number;
};

/**
 * Build the full audio plan for a project.
 *
 * Two families of sound end up in the same list because the render mixes them
 * the same way: timeline audio clips, and the audio of video layers inside
 * scenes. Muted tracks, muted layers, zero-volume and zero-length items are
 * dropped here rather than scheduled and silenced, so the item count is also
 * the mix's input count.
 */
export function planProjectAudio(
    project: Project | null | undefined,
): AudioPlanItem[] {
    if (!project) {
        return [];
    }

    const assets = new Map<number, Asset>(
        (project.assets ?? []).map((asset) => [asset.id, asset]),
    );

    return [
        ...planAudioTracks(project, assets),
        ...planSceneAudio(project, assets),
    ];
}

/** Timeline audio clips: trim, fades, per-clip volume, per-track volume. */
function planAudioTracks(
    project: Project,
    assets: Map<number, Asset>,
): AudioPlanItem[] {
    const scenes = project.scenes ?? [];
    const fps = project.fps || 30;
    const items: AudioPlanItem[] = [];

    for (const track of project.audio_tracks ?? []) {
        if (track.muted) {
            continue;
        }

        const trackVolume = clampVolume(track.volume ?? 1);

        for (const clip of track.clips ?? []) {
            const url = assetUrl(assets.get(clip.asset_id));
            const durationMs = Math.max(0, Math.round(clip.duration_ms ?? 0));
            const gain = clampVolume(clip.volume ?? 1) * trackVolume;

            if (!url || durationMs <= 0 || gain <= 0) {
                continue;
            }

            const trimStartMs = Math.max(0, clip.trim_start_ms ?? 0);

            items.push({
                id: clip.id,
                url,
                assetId: clip.asset_id,
                startMs: mapTimelineMs(scenes, clip.start_ms ?? 0, fps),
                durationMs,
                sourceStartSec: trimStartMs / 1000,
                sourceEndSec: (trimStartMs + durationMs) / 1000,
                speed: 1,
                gain,
                fadeInMs: clampFade(clip.fade_in_ms, durationMs),
                fadeOutMs: clampFade(clip.fade_out_ms, durationMs),
            });
        }
    }

    return items;
}

/**
 * Audio carried by video layers inside scenes.
 *
 * The fade pair is not decoration: because a transition overlaps two scenes in
 * output time, their audio overlaps too, and fading each side over the
 * transition duration is what turns that overlap into a crossfade instead of a
 * doubled-loudness collision. The server does the same thing for the same
 * reason.
 */
function planSceneAudio(
    project: Project,
    assets: Map<number, Asset>,
): AudioPlanItem[] {
    const scenes = project.scenes ?? [];
    const fps = project.fps || 30;
    const starts = sceneStartsMs(scenes, fps);
    const transitions = resolveTransitions(scenes, fps);
    const items: AudioPlanItem[] = [];

    scenes.forEach((scene, sceneIndex) => {
        const sceneDurationMs = Math.max(0, Math.round(scene.duration_ms ?? 0));
        if (sceneDurationMs <= 0) {
            return;
        }

        const fadeInMs = transitions[sceneIndex - 1]?.durationMs ?? 0;
        const fadeOutMs = transitions[sceneIndex]?.durationMs ?? 0;

        for (const layer of scene.layers ?? []) {
            if (layer.type !== 'video' || !layer.asset_id || layer.muted) {
                continue;
            }

            const asset = assets.get(layer.asset_id);
            const url = assetUrl(asset);
            const gain = clampVolume(layer.volume ?? 1);

            if (!url || gain <= 0) {
                continue;
            }

            const speed = clampSpeed(layer.speed);
            const trimStartMs = Math.max(0, layer.trim_start_ms ?? 0);
            // The scene consumes `sceneDuration * speed` of source, but never
            // more than the trim (or the asset) actually holds.
            const availableEndMs =
                layer.trim_end_ms ?? asset?.duration_ms ?? null;
            const wantedEndMs = trimStartMs + sceneDurationMs * speed;
            const sourceEndMs =
                availableEndMs !== null && Number.isFinite(availableEndMs)
                    ? Math.min(availableEndMs, wantedEndMs)
                    : wantedEndMs;

            const playableMs = Math.max(
                0,
                Math.round((sourceEndMs - trimStartMs) / speed),
            );
            if (playableMs <= 0) {
                continue;
            }

            const durationMs = Math.min(sceneDurationMs, playableMs);

            items.push({
                id: `${scene.id}:${layer.id}`,
                url,
                assetId: layer.asset_id,
                startMs: starts[sceneIndex] ?? 0,
                durationMs,
                sourceStartSec: trimStartMs / 1000,
                sourceEndSec: sourceEndMs / 1000,
                speed,
                gain,
                fadeInMs: clampFade(fadeInMs, durationMs),
                fadeOutMs: clampFade(fadeOutMs, durationMs),
            });
        }
    });

    return items;
}

function clampFade(
    value: number | undefined | null,
    durationMs: number,
): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return 0;
    }

    return Math.min(Math.round(value), durationMs);
}

/** Audio assets carry no thumbnail, so `url` is the only usable source. */
function assetUrl(asset: Asset | undefined): string | null {
    return asset?.url ?? null;
}

/* ------------------------------------------------------------------ */
/* rendering                                                           */
/* ------------------------------------------------------------------ */

/**
 * The Web Audio surface this module needs, narrowed to what it uses.
 *
 * Declared structurally so tests can substitute a recording double: jsdom has
 * no Web Audio at all, and gain staging is precisely the thing that must be
 * verified rather than assumed.
 */
export type OfflineMixContext = Pick<
    OfflineAudioContext,
    | 'sampleRate'
    | 'destination'
    | 'createBufferSource'
    | 'createGain'
    | 'createBuffer'
    | 'startRendering'
>;

export type AudioRenderDeps = {
    /** Build the offline context the mix is rendered into. */
    createContext: (
        channels: number,
        frames: number,
        sampleRate: number,
    ) => OfflineMixContext;
    /**
     * Decode a source range into one gapless buffer, or null when the asset
     * carries no usable audio. Never rejects for a merely undecodable asset.
     */
    decode: (
        context: OfflineMixContext,
        url: string,
        startSec: number,
        endSec: number,
    ) => Promise<AudioBuffer | null>;
};

/**
 * Render the plan into a single mixed buffer, or null when there is nothing to
 * mix (which the caller must treat as "add no audio track", not as silence).
 *
 * ## Gain staging
 *
 * Every item is connected to the destination through exactly one gain node
 * holding its own volume. Web Audio sums its inputs verbatim, so N clips at
 * full volume produce N times the amplitude — the same verbatim sum the server
 * now performs — and the peaks are then handled by {@link applyPeakLimiter}.
 * There is deliberately NO division by the input count anywhere in this file.
 */
export async function renderAudioPlan(
    items: readonly AudioPlanItem[],
    durationMs: number,
    deps: AudioRenderDeps,
): Promise<AudioBuffer | null> {
    const durationSec = Math.max(0, durationMs) / 1000;

    if (items.length === 0 || durationSec <= 0) {
        return null;
    }

    const frames = Math.max(1, Math.ceil(durationSec * EXPORT_SAMPLE_RATE));
    const context = deps.createContext(
        EXPORT_CHANNELS,
        frames,
        EXPORT_SAMPLE_RATE,
    );
    let scheduled = 0;

    for (const item of items) {
        const buffer = await deps.decode(
            context,
            item.url,
            item.sourceStartSec,
            item.sourceEndSec,
        );

        if (!buffer || buffer.length === 0) {
            continue;
        }

        const startSec = item.startMs / 1000;
        const playSec = item.durationMs / 1000;

        const source = context.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = item.speed;

        const gain = context.createGain();
        applyGainEnvelope(gain, item, startSec, playSec);

        source.connect(gain);
        gain.connect(context.destination);
        // `stop` bounds the item to its timeline length even when the decoded
        // range came back longer, which keeps a clip's audio inside its clip.
        source.start(startSec);
        source.stop(startSec + playSec);
        scheduled++;
    }

    if (scheduled === 0) {
        return null;
    }

    const rendered = await context.startRendering();
    applyPeakLimiter(rendered);

    return rendered;
}

/**
 * Linear fade in/out around a flat body, matching ffmpeg's default `afade`
 * curve (`tri`). The flat value is the item's own gain — never scaled by how
 * many other items are playing.
 */
function applyGainEnvelope(
    gain: GainNode,
    item: AudioPlanItem,
    startSec: number,
    playSec: number,
): void {
    const fadeInSec = item.fadeInMs / 1000;
    const fadeOutSec = item.fadeOutMs / 1000;

    if (fadeInSec > 0) {
        gain.gain.setValueAtTime(0, startSec);
        gain.gain.linearRampToValueAtTime(item.gain, startSec + fadeInSec);
    } else {
        gain.gain.setValueAtTime(item.gain, startSec);
    }

    if (fadeOutSec > 0 && playSec > 0) {
        const fadeStartSec =
            startSec + Math.max(fadeInSec, playSec - fadeOutSec);
        gain.gain.setValueAtTime(item.gain, fadeStartSec);
        gain.gain.linearRampToValueAtTime(0, startSec + playSec);
    }
}

/**
 * Brick-wall peak limiter, applied in place.
 *
 * Web Audio's only built-in dynamics node is `DynamicsCompressorNode`, which is
 * a soft-knee compressor with its own colouration and no guaranteed ceiling —
 * it cannot stand in for ffmpeg's `alimiter`. So the ceiling is enforced here
 * on the rendered samples instead, which is simple, exact and testable:
 *
 * - attack is instantaneous, so the ceiling is never exceeded (a limiter that
 *   overshoots is not a limiter);
 * - release is a one-pole recovery over `releaseSec`, so a single loud
 *   transient does not duck the following half-second audibly;
 * - the gain is shared across channels, so the stereo image does not shift.
 *
 * Below the ceiling this is a no-op, which is the normal case: it never
 * attenuates a mix that already fits, and in particular never divides by the
 * number of inputs.
 */
export function applyPeakLimiter(
    buffer: AudioBuffer,
    ceiling: number = AUDIO_PEAK_CEILING,
    releaseSec: number = AUDIO_LIMITER_RELEASE_SEC,
): void {
    const channels: Float32Array[] = [];
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        channels.push(buffer.getChannelData(channel));
    }

    if (channels.length === 0 || buffer.length === 0) {
        return;
    }

    const releaseFrames = Math.max(
        1,
        Math.round(releaseSec * buffer.sampleRate),
    );
    // One-pole coefficient that recovers ~63% of the gap per release window.
    const recovery = 1 - Math.exp(-1 / releaseFrames);
    let gain = 1;

    for (let frame = 0; frame < buffer.length; frame++) {
        let peak = 0;
        for (const data of channels) {
            const magnitude = Math.abs(data[frame]);
            if (magnitude > peak) {
                peak = magnitude;
            }
        }

        const required = peak > ceiling ? ceiling / peak : 1;

        gain = required < gain ? required : gain + (required - gain) * recovery;

        if (gain < 1) {
            for (const data of channels) {
                data[frame] = data[frame] * gain;
            }
        }
    }
}

/* ------------------------------------------------------------------ */
/* browser defaults                                                    */
/* ------------------------------------------------------------------ */

/** Default deps: a real `OfflineAudioContext` and mediabunny-backed decoding. */
export function browserAudioRenderDeps(): AudioRenderDeps {
    return {
        createContext: (channels, frames, sampleRate) =>
            new OfflineAudioContext(channels, frames, sampleRate),
        decode: decodeSourceRange,
    };
}

/**
 * Decode one source range, owning the provider for the duration of the call.
 *
 * The export touches each asset once and in order, so acquiring and releasing
 * per item keeps no decoders open between items. The decoding itself is shared
 * with the preview engine so the two cannot disagree about what a clip sounds
 * like.
 */
async function decodeSourceRange(
    context: OfflineMixContext,
    url: string,
    startSec: number,
    endSec: number,
): Promise<AudioBuffer | null> {
    const provider = acquireMediaProvider(url);

    try {
        return await sharedDecodeSourceRange(
            provider,
            context,
            startSec,
            endSec,
        );
    } finally {
        provider.release();
    }
}

/**
 * Cut a rendered mix into fixed-length pieces.
 *
 * `AudioBufferSource.add` takes no timestamp — each buffer is placed at the
 * total duration of all previous ones — so the export MUST feed a gapless
 * stream. Slicing one already-rendered buffer guarantees that by construction,
 * while still letting the export await each piece for encoder backpressure.
 */
export function sliceAudioBuffer(
    buffer: AudioBuffer,
    startFrame: number,
    frameCount: number,
    createBuffer: (
        channels: number,
        frames: number,
        sampleRate: number,
    ) => AudioBuffer = defaultCreateBuffer,
): AudioBuffer {
    const frames = Math.max(
        1,
        Math.min(frameCount, buffer.length - startFrame),
    );
    const slice = createBuffer(
        buffer.numberOfChannels,
        frames,
        buffer.sampleRate,
    );

    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const data = buffer
            .getChannelData(channel)
            .subarray(startFrame, startFrame + frames);
        slice.copyToChannel(data, channel, 0);
    }

    return slice;
}

function defaultCreateBuffer(
    channels: number,
    frames: number,
    sampleRate: number,
): AudioBuffer {
    return new AudioBuffer({
        numberOfChannels: channels,
        length: frames,
        sampleRate,
    });
}
