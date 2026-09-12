import type { Project } from '@/types/editor';
import { decodeSourceRange } from './audio-decode';
import { mediaLimits } from './editor-features';
import { planProjectAudio } from './export-audio';
import type { AudioPlanItem } from './export-audio';
import { acquireMediaProvider } from './media-provider';
import type { MediaProvider } from './media-provider';

/**
 * The preview's audio master clock.
 *
 * ## Why this exists
 *
 * Preview playback used to run on a `requestAnimationFrame` wall clock, with
 * one `HTMLAudioElement` per audio clip *chasing* it — seeking whenever drift
 * passed 200ms, and nudging the rAF clock back toward the element in between.
 * Two clocks negotiating is not a clock: it drifts, it cannot be
 * sample-accurate, and it made every fade a per-frame `volume` write.
 *
 * Here the relationship is inverted. One `AudioContext` owns the time; every
 * sound is scheduled ahead of the playhead against `ctx.currentTime`, and the
 * picture follows: `timelineStore.syncToClock()` is fed from
 * {@link AudioEngine.currentTimeMs}. Nothing chases anything.
 *
 * ## What it mixes
 *
 * The plan comes from `planProjectAudio`, shared verbatim with the browser
 * export, so the preview, the browser export and the server render agree on
 * what is audible: timeline audio clips AND the audio of video layers inside
 * scenes — the latter being the regression this module fixes, lost when the
 * per-layer `<video>` elements were replaced by the canvas compositor. Both
 * families are positioned on the TRANSITION-MAPPED timeline, so audio lines up
 * with the transition-aware picture.
 *
 * ## Gain staging
 *
 * Sources are summed VERBATIM — there is deliberately no division by the
 * number of inputs anywhere in this file. ffmpeg's `amix` used to do exactly
 * that (`normalize=1`), which made a project quieter the more clips it had and
 * silently contradicted the volumes the user set; the server was fixed to sum
 * with `normalize=0` behind a brick-wall limiter at 0.95, and re-introducing
 * the division here would recreate the same divergence from the preview side.
 * Peaks are caught by a `DynamicsCompressorNode` configured as tightly as
 * Web Audio allows (see {@link createLimiter}).
 *
 * Everything that decides *what plays, when and how loud* is a pure function
 * below and is tested without any Web Audio at all; only the engine object
 * touches a context.
 */

/** Peak ceiling after the sum. Mirrors `FFmpegService::AUDIO_LIMITER`. */
export const PREVIEW_PEAK_CEILING = 0.95;

/* ------------------------------------------------------------------ */
/* pure: the clock                                                     */
/* ------------------------------------------------------------------ */

/**
 * The mapping between context time and timeline time.
 *
 * A single recorded pair plus the playback rate is the whole clock: every
 * position, in either direction, is derived from it. Re-anchoring (on seek, on
 * a rate change) is therefore one assignment rather than a resynchronisation.
 */
export type ClockAnchor = {
    /** `ctx.currentTime` when the anchor was taken. */
    ctxTimeSec: number;
    /** Timeline position, in ms, that `ctxTimeSec` corresponds to. */
    timelineMs: number;
    /** Timeline ms per context second, as a multiplier of real time. */
    rate: number;
};

export function timelineToCtxSec(
    anchor: ClockAnchor,
    timelineMs: number,
): number {
    return (
        anchor.ctxTimeSec +
        (timelineMs - anchor.timelineMs) / 1000 / anchor.rate
    );
}

export function ctxToTimelineMs(
    anchor: ClockAnchor,
    ctxTimeSec: number,
): number {
    return (
        anchor.timelineMs +
        (ctxTimeSec - anchor.ctxTimeSec) * 1000 * anchor.rate
    );
}

/**
 * The timeline position that is AUDIBLE right now.
 *
 * What the destination is playing at `ctx.currentTime` was handed to the
 * hardware `latencySec` earlier, so the picture must lag the scheduler by the
 * same amount or it runs ahead of the sound by an output buffer.
 */
export function audibleTimelineMs(
    anchor: ClockAnchor,
    ctxTimeSec: number,
    latencySec: number,
): number {
    return ctxToTimelineMs(anchor, ctxTimeSec - Math.max(0, latencySec));
}

/* ------------------------------------------------------------------ */
/* pure: scheduling                                                    */
/* ------------------------------------------------------------------ */

export type GainEvent = {
    type: 'set' | 'ramp';
    value: number;
    /** Absolute context time. */
    timeSec: number;
};

/**
 * One source, resolved into the exact arguments Web Audio needs.
 *
 * Every field is in the units the node API expects — context seconds for the
 * schedule, buffer seconds for the source range — so applying a cue is a
 * mechanical translation with no arithmetic left in it.
 */
export type AudioCue = {
    id: string;
    url: string;
    /** Decode range on the source, shared with the export's plan. */
    sourceStartSec: number;
    sourceEndSec: number;
    /** `ctx.currentTime` at which the source starts. */
    whenSec: number;
    /** Offset INTO THE DECODED BUFFER (which begins at `sourceStartSec`). */
    offsetSec: number;
    /** Source seconds consumed; the `duration` argument of `start()`. */
    sourceDurationSec: number;
    /** Context seconds the cue occupies; when the source is stopped. */
    contextDurationSec: number;
    /** Source playback rate: the clip's own speed times the timeline rate. */
    rate: number;
    /** Gain automation, in absolute context time. */
    gainEvents: GainEvent[];
};

/** Items that overlap `[playheadMs, playheadMs + aheadMs)` and have not ended. */
export function itemsInWindow(
    items: readonly AudioPlanItem[],
    playheadMs: number,
    aheadMs: number,
): AudioPlanItem[] {
    return items.filter(
        (item) =>
            item.startMs + item.durationMs > playheadMs &&
            item.startMs < playheadMs + aheadMs,
    );
}

/**
 * Items far enough from the playhead that holding a decoder open for them is
 * waste. Audio decode competes with the capped video preview decoders, so
 * anything outside the keep window lets go.
 */
export function itemsOutsideKeepWindow(
    items: readonly AudioPlanItem[],
    playheadMs: number,
    keepMs: number,
): AudioPlanItem[] {
    return items.filter(
        (item) =>
            item.startMs + item.durationMs < playheadMs - keepMs ||
            item.startMs > playheadMs + keepMs,
    );
}

/**
 * Linear fade envelope of an item at an absolute timeline position.
 *
 * Matches the export's `applyGainEnvelope` and ffmpeg's default `afade` curve
 * (`tri`), and is needed as a value — not just as a ramp — because seeking into
 * the middle of a fade has to start the node at the value the fade had reached.
 */
export function envelopeGainAt(
    item: AudioPlanItem,
    timelineMs: number,
): number {
    const endMs = item.startMs + item.durationMs;
    let multiplier = 1;

    if (item.fadeInMs > 0) {
        multiplier = Math.min(
            multiplier,
            (timelineMs - item.startMs) / item.fadeInMs,
        );
    }

    if (item.fadeOutMs > 0) {
        multiplier = Math.min(
            multiplier,
            (endMs - timelineMs) / item.fadeOutMs,
        );
    }

    return item.gain * Math.min(1, Math.max(0, multiplier));
}

/**
 * Gain automation for the portion of an item starting at `fromMs`.
 *
 * Ramps are scheduled on the gain node instead of being recomputed per frame in
 * JS: the audio thread then interpolates them at sample resolution, and a
 * dropped animation frame can no longer leave a fade half-applied. Fades are
 * clamped to the item's own duration by `planProjectAudio`, and the fade-out is
 * additionally held off until the fade-in has finished so a clip shorter than
 * the sum of its fades still produces a monotonic envelope rather than
 * overlapping ramps.
 */
export function buildGainEvents(
    item: AudioPlanItem,
    fromMs: number,
    whenSec: number,
    rate: number,
): GainEvent[] {
    const endMs = item.startMs + item.durationMs;
    const toCtx = (timelineMs: number) =>
        whenSec + (timelineMs - fromMs) / 1000 / rate;

    const events: GainEvent[] = [
        { type: 'set', value: envelopeGainAt(item, fromMs), timeSec: whenSec },
    ];

    const fadeInEndMs = item.startMs + item.fadeInMs;
    if (item.fadeInMs > 0 && fadeInEndMs > fromMs) {
        events.push({
            type: 'ramp',
            value: item.gain,
            timeSec: toCtx(fadeInEndMs),
        });
    }

    if (item.fadeOutMs > 0) {
        const fadeOutStartMs = Math.max(fadeInEndMs, endMs - item.fadeOutMs);

        if (fadeOutStartMs > fromMs) {
            events.push({
                type: 'set',
                value: item.gain,
                timeSec: toCtx(fadeOutStartMs),
            });
        }

        events.push({ type: 'ramp', value: 0, timeSec: toCtx(endMs) });
    }

    return events;
}

/**
 * Resolve one plan item into a cue, or null when there is nothing left of it.
 *
 * `ctxNowSec` matters: an item that is already under the playhead (the normal
 * case after a seek) maps to a context time in the past, which Web Audio would
 * silently clamp to "now" while still playing the source from its beginning —
 * i.e. late. The cue is therefore re-based onto the present and its source
 * offset advanced by the same amount, so a seek lands mid-source rather than
 * replaying what should already have been heard.
 */
export function buildCue(
    item: AudioPlanItem,
    anchor: ClockAnchor,
    playheadMs: number,
    ctxNowSec: number,
): AudioCue | null {
    const endMs = item.startMs + item.durationMs;
    let fromMs = Math.max(item.startMs, playheadMs);
    let whenSec = timelineToCtxSec(anchor, fromMs);

    if (whenSec < ctxNowSec) {
        whenSec = ctxNowSec;
        fromMs = ctxToTimelineMs(anchor, ctxNowSec);
    }

    if (fromMs >= endMs) {
        return null;
    }

    const remainingMs = endMs - fromMs;
    const intoItemMs = Math.max(0, fromMs - item.startMs);

    return {
        id: item.id,
        url: item.url,
        sourceStartSec: item.sourceStartSec,
        sourceEndSec: item.sourceEndSec,
        whenSec,
        offsetSec: (intoItemMs / 1000) * item.speed,
        sourceDurationSec: (remainingMs / 1000) * item.speed,
        contextDurationSec: remainingMs / 1000 / anchor.rate,
        rate: item.speed * anchor.rate,
        gainEvents: buildGainEvents(item, fromMs, whenSec, anchor.rate),
    };
}

/* ------------------------------------------------------------------ */
/* the engine                                                          */
/* ------------------------------------------------------------------ */

/**
 * The Web Audio surface the engine uses, narrowed and declared structurally so
 * tests can hand it a recording double: jsdom has no Web Audio whatsoever, and
 * gain staging is exactly the thing that must be verified rather than assumed.
 */
export type EngineAudioContext = {
    readonly currentTime: number;
    readonly state: AudioContextState;
    readonly sampleRate: number;
    readonly destination: AudioNode;
    /** Absent on older implementations; treated as zero latency. */
    readonly baseLatency?: number;
    readonly outputLatency?: number;
    createBufferSource(): AudioBufferSourceNode;
    createGain(): GainNode;
    createBuffer(
        channels: number,
        frames: number,
        sampleRate: number,
    ): AudioBuffer;
    createDynamicsCompressor(): DynamicsCompressorNode;
    resume(): Promise<void>;
    close(): Promise<void>;
};

export type AudioEngineDeps = {
    /** Build the context, or return null where Web Audio is unavailable. */
    createContext: () => EngineAudioContext | null;
    /**
     * Decode a source range into one gapless buffer, or null when the asset
     * carries no usable audio. Must never reject for a merely broken asset.
     */
    decode: (
        context: EngineAudioContext,
        url: string,
        startSec: number,
        endSec: number,
    ) => Promise<AudioBuffer | null>;
    /** Release any decoder held for a URL that has left the keep window. */
    releaseUrl: (url: string) => void;
};

export type AudioEngine = {
    /** True when the current plan contains anything audible at all. */
    readonly hasAudio: boolean;
    /** True while the context is running and the clock is authoritative. */
    readonly isMasterClock: boolean;
    /** Replace the plan. Re-schedules in place if playing. */
    setPlan(items: readonly AudioPlanItem[]): void;
    /** Start (or resume) at a timeline position. Needs a user gesture. */
    play(timelineMs: number): Promise<void>;
    pause(): void;
    seek(timelineMs: number): void;
    setPlaybackRate(rate: number): void;
    /**
     * The audible timeline position, or null when the audio clock is not
     * driving (no audio, no context, context not running, not playing) and the
     * caller must fall back to its own clock.
     */
    currentTimeMs(): number | null;
    /** Run one scheduling pass. Called by the engine's own timer; exposed for tests. */
    tick(): void;
    dispose(): void;
};

/** Live nodes for one scheduled cue, kept so seek and teardown can undo them. */
type LiveCue = {
    source: AudioBufferSourceNode;
    gain: GainNode;
    /** Context time the cue is finished at; used to retire it. */
    endsAtSec: number;
};

export function createAudioEngine(
    deps: AudioEngineDeps = browserAudioEngineDeps(),
): AudioEngine {
    let context: EngineAudioContext | null = null;
    let master: GainNode | null = null;
    let contextFailed = false;

    let items: readonly AudioPlanItem[] = [];
    let playing = false;
    let rate = 1;
    let anchor: ClockAnchor | null = null;
    /** Timeline position used when not playing, and the base of every anchor. */
    let positionMs = 0;

    const live = new Map<string, LiveCue>();
    /** Decoded ranges, keyed by item id; a plan change invalidates by id. */
    const buffers = new Map<string, AudioBuffer | null>();
    const decoding = new Set<string>();
    /** URLs whose provider this engine is currently keeping alive. */
    const heldUrls = new Set<string>();
    /** Bumped on every re-schedule so in-flight decodes can detect staleness. */
    let generation = 0;
    let timer: ReturnType<typeof setInterval> | null = null;

    function latencySec(): number {
        if (!context) {
            return 0;
        }

        return (context.baseLatency ?? 0) + (context.outputLatency ?? 0);
    }

    function ensureContext(): EngineAudioContext | null {
        if (context || contextFailed) {
            return context;
        }

        try {
            context = deps.createContext();
        } catch {
            context = null;
        }

        if (!context) {
            contextFailed = true;

            return null;
        }

        master = context.createGain();
        master.gain.value = 1;
        master.connect(createLimiter(context)).connect(context.destination);

        return context;
    }

    function clockMs(): number {
        if (!context || !anchor) {
            return positionMs;
        }

        return Math.max(
            0,
            audibleTimelineMs(anchor, context.currentTime, latencySec()),
        );
    }

    function stopCue(id: string): void {
        const cue = live.get(id);
        if (!cue) {
            return;
        }

        live.delete(id);

        try {
            cue.source.stop();
        } catch {
            // Stopping a source that never started throws; nothing to undo.
        }

        cue.source.disconnect();
        cue.gain.disconnect();
    }

    function stopAllCues(): void {
        for (const id of [...live.keys()]) {
            stopCue(id);
        }
    }

    function scheduleCue(item: AudioPlanItem, buffer: AudioBuffer): void {
        const ctx = context;
        if (!ctx || !master || !anchor || !playing || live.has(item.id)) {
            return;
        }

        const cue = buildCue(item, anchor, clockMs(), ctx.currentTime);
        if (!cue || cue.offsetSec >= buffer.duration) {
            return;
        }

        const gain = ctx.createGain();
        for (const event of cue.gainEvents) {
            if (event.type === 'set') {
                gain.gain.setValueAtTime(event.value, event.timeSec);
            } else {
                gain.gain.linearRampToValueAtTime(event.value, event.timeSec);
            }
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = cue.rate;
        source.connect(gain);
        // Straight into the master sum: verbatim, never divided by input count.
        gain.connect(master);

        source.start(cue.whenSec, cue.offsetSec, cue.sourceDurationSec);
        // `stop` bounds the cue in CONTEXT time, which `duration` alone cannot
        // do once a clip's own speed makes source and context seconds differ.
        source.stop(cue.whenSec + cue.contextDurationSec);

        live.set(item.id, {
            source,
            gain,
            endsAtSec: cue.whenSec + cue.contextDurationSec,
        });
    }

    function requestDecode(item: AudioPlanItem): void {
        const ctx = context;
        if (!ctx || buffers.has(item.id) || decoding.has(item.id)) {
            return;
        }

        if (decoding.size >= mediaLimits.concurrentAudioDecodes) {
            return;
        }

        decoding.add(item.id);
        heldUrls.add(item.url);
        const started = generation;

        deps.decode(ctx, item.url, item.sourceStartSec, item.sourceEndSec)
            .catch(() => null)
            .then((buffer) => {
                decoding.delete(item.id);
                buffers.set(item.id, buffer);

                // A seek or a plan change while the decode was in flight means
                // the cue this buffer was fetched for no longer exists; the
                // next tick decides afresh whether it is still wanted.
                if (buffer && started === generation) {
                    scheduleCue(item, buffer);
                }
            });
    }

    function releaseDistantUrls(playheadMs: number): void {
        const distant = new Set(
            itemsOutsideKeepWindow(
                items,
                playheadMs,
                mediaLimits.audioProviderKeepMs,
            ),
        );
        const wanted = new Set(
            items.filter((item) => !distant.has(item)).map((item) => item.url),
        );

        for (const item of distant) {
            buffers.delete(item.id);
        }

        for (const url of [...heldUrls]) {
            if (!wanted.has(url)) {
                heldUrls.delete(url);
                deps.releaseUrl(url);
            }
        }
    }

    function tick(): void {
        if (!playing || !context || !anchor) {
            return;
        }

        const playheadMs = clockMs();
        const nowSec = context.currentTime;

        // Retired only once the audible playhead has passed the cue's end, not
        // merely the scheduler: dropping it a latency early would leave the
        // item back inside the lookahead window and schedule a duplicate sliver
        // of its tail.
        for (const [id, cue] of [...live]) {
            if (cue.endsAtSec <= nowSec - latencySec()) {
                stopCue(id);
            }
        }

        for (const item of itemsInWindow(
            items,
            playheadMs,
            mediaLimits.audioScheduleAheadMs,
        )) {
            if (live.has(item.id)) {
                continue;
            }

            const buffer = buffers.get(item.id);

            if (buffer === undefined) {
                requestDecode(item);
            } else if (buffer) {
                scheduleCue(item, buffer);
            }
        }

        releaseDistantUrls(playheadMs);
    }

    /** Tear every scheduled node down and re-anchor at `timelineMs`. */
    function reschedule(timelineMs: number): void {
        generation++;
        stopAllCues();
        positionMs = Math.max(0, timelineMs);

        if (!playing || !context) {
            anchor = null;

            return;
        }

        // The anchor lives in SCHEDULER time: `positionMs` is the timeline
        // position of the audio handed to the context right now, which reaches
        // the ears one output latency later. `clockMs` subtracts that latency
        // again, so the picture shows what is audible rather than what has been
        // queued.
        anchor = {
            ctxTimeSec: context.currentTime,
            timelineMs: positionMs,
            rate,
        };

        tick();
    }

    function startTimer(): void {
        if (timer === null) {
            timer = setInterval(tick, mediaLimits.audioSchedulePumpMs);
        }
    }

    function stopTimer(): void {
        if (timer !== null) {
            clearInterval(timer);
            timer = null;
        }
    }

    return {
        get hasAudio(): boolean {
            return items.length > 0;
        },

        get isMasterClock(): boolean {
            return (
                playing &&
                context !== null &&
                context.state === 'running' &&
                anchor !== null
            );
        },

        setPlan(next: readonly AudioPlanItem[]): void {
            const ids = new Set(next.map((item) => item.id));
            items = next;

            for (const id of [...buffers.keys()]) {
                if (!ids.has(id)) {
                    buffers.delete(id);
                }
            }

            if (playing) {
                reschedule(clockMs());
            }
        },

        async play(timelineMs: number): Promise<void> {
            positionMs = Math.max(0, timelineMs);
            // `resume()` is awaited below, and a user can pause (or the editor
            // can unmount) while it is pending; the generation taken here is
            // what makes that outcome "stay paused" rather than "start anyway".
            const token = ++generation;

            if (items.length === 0) {
                return;
            }

            const ctx = ensureContext();
            if (!ctx) {
                return;
            }

            // Autoplay policy: the context starts suspended and only a user
            // gesture can lift it. The editor's play button IS that gesture, so
            // this resume is the one that matters — it must happen before the
            // clock is anchored or the anchor would be taken against a frozen
            // `currentTime`.
            if (ctx.state !== 'running') {
                try {
                    await ctx.resume();
                } catch {
                    return;
                }
            }

            if (ctx.state !== 'running' || token !== generation) {
                return;
            }

            playing = true;
            reschedule(positionMs);
            startTimer();
        },

        pause(): void {
            if (playing) {
                positionMs = clockMs();
            }

            playing = false;
            generation++;
            stopTimer();
            stopAllCues();
            anchor = null;
        },

        seek(timelineMs: number): void {
            if (!playing) {
                positionMs = Math.max(0, timelineMs);

                return;
            }

            reschedule(timelineMs);
        },

        setPlaybackRate(next: number): void {
            const clamped = Number.isFinite(next) && next > 0 ? next : 1;
            if (clamped === rate) {
                return;
            }

            const at = clockMs();
            rate = clamped;
            // Every live node was scheduled against the old rate, both in when
            // it plays and how fast it reads; re-anchoring is the only honest
            // way to change it.
            reschedule(at);
        },

        currentTimeMs(): number | null {
            if (
                !playing ||
                !context ||
                !anchor ||
                context.state !== 'running'
            ) {
                return null;
            }

            return clockMs();
        },

        tick,

        dispose(): void {
            playing = false;
            generation++;
            stopTimer();
            stopAllCues();
            anchor = null;
            buffers.clear();
            decoding.clear();

            for (const url of heldUrls) {
                deps.releaseUrl(url);
            }
            heldUrls.clear();

            master?.disconnect();
            master = null;

            const ctx = context;
            context = null;
            void ctx?.close().catch(() => undefined);
        },
    };
}

/**
 * A brick-wall-ish limiter on the master bus.
 *
 * `DynamicsCompressorNode` is the only dynamics processor Web Audio offers in
 * real time, and it is a soft-knee compressor rather than ffmpeg's `alimiter`:
 * with a zero knee, a 20:1 ratio and the shortest attack the node allows, it
 * holds the sum close to the ceiling, but it does NOT guarantee it the way the
 * export's sample-domain limiter does. That difference is inaudible against
 * its purpose here, which is to stop a dense mix from clipping — never to
 * attenuate a mix that already fits, and never to divide by input count.
 */
export function createLimiter(
    context: EngineAudioContext,
): DynamicsCompressorNode {
    const limiter = context.createDynamicsCompressor();

    limiter.threshold.value = 20 * Math.log10(PREVIEW_PEAK_CEILING);
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.05;

    return limiter;
}

/* ------------------------------------------------------------------ */
/* browser defaults                                                    */
/* ------------------------------------------------------------------ */

/** Plan a project's preview audio. Identical to what the export mixes. */
export function planPreviewAudio(
    project: Project | null | undefined,
): AudioPlanItem[] {
    return planProjectAudio(project);
}

export function browserAudioEngineDeps(): AudioEngineDeps {
    const providers = new Map<string, MediaProvider>();

    function providerFor(url: string): MediaProvider {
        let provider = providers.get(url);

        if (!provider) {
            provider = acquireMediaProvider(url);
            providers.set(url, provider);
        }

        return provider;
    }

    return {
        createContext: () => {
            const Ctor =
                typeof globalThis.AudioContext !== 'undefined'
                    ? globalThis.AudioContext
                    : (
                          globalThis as {
                              webkitAudioContext?: typeof AudioContext;
                          }
                      ).webkitAudioContext;

            return Ctor ? (new Ctor() as unknown as EngineAudioContext) : null;
        },

        decode: (context, url, startSec, endSec) =>
            decodeSourceRange(providerFor(url), context, startSec, endSec),

        releaseUrl: (url) => {
            const provider = providers.get(url);

            if (provider) {
                providers.delete(url);
                provider.release();
            }
        },
    };
}
