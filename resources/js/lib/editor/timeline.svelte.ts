import type { Scene } from '@/types';
import { projectStore } from './project.svelte';
import {
    getSceneIndexAtMs,
    getSceneStartsMs,
    getTotalDurationMs,
} from './selectors';

/**
 * An authoritative external clock, in timeline ms, or null when it cannot
 * currently say — no audio in the project, no `AudioContext`, a context the
 * autoplay policy left suspended. Returning null is not an error: it hands the
 * timeline straight back to the rAF wall clock for that frame.
 */
export type ClockSource = () => number | null;

export type TimelineStore = {
    currentTimeMs: number;
    isPlaying: boolean;
    playbackRate: number;
    zoom: number;
    pixelsPerMs: number;
    setCurrentTime: (ms: number) => void;
    syncToClock: (ms: number) => void;
    play: () => void;
    pause: () => void;
    togglePlayback: () => void;
    setPlaybackRate: (rate: number) => void;
    setZoom: (zoom: number) => void;
    stepFrames: (frames: number) => void;
    seekToScene: (sceneIndex: number) => void;
    setClockSource: (source: ClockSource | null) => void;
    getCurrentScene: () => Scene | null;
    getCurrentSceneIndex: () => number;
    getTotalDuration: () => number;
    onCurrentSceneChange: (callback: (scene: Scene | null) => void) => void;
};

let currentTimeMs = $state(0);
let isPlaying = $state(false);
let playbackRate = $state(1.0);
let zoom = $state(1.0);
let animationFrameId: number | null = null;
let lastFrameTime: number | null = null;
let clockSource: ClockSource | null = null;

const BASE_PIXELS_PER_MS = 0.1;

function getPixelsPerMs(): number {
    return BASE_PIXELS_PER_MS * zoom;
}

const sceneChangeCallbacks: Array<(scene: Scene | null) => void> = [];

/**
 * Register for the moment the playhead crosses into another scene. Selection
 * follows the playhead through this hook rather than through a component
 * effect, so the rule lives in one tested place.
 */
function onCurrentSceneChange(callback: (scene: Scene | null) => void): void {
    sceneChangeCallbacks.push(callback);
}

function assignCurrentTime(ms: number): void {
    const before = getCurrentSceneIndex();
    const totalDuration = getTotalDuration();
    currentTimeMs = Math.max(0, Math.min(ms, totalDuration));

    if (getCurrentSceneIndex() !== before) {
        const scene = getCurrentScene();
        for (const callback of sceneChangeCallbacks) {
            callback(scene);
        }
    }
}

function setCurrentTime(ms: number): void {
    assignCurrentTime(ms);
}

/**
 * Re-anchor the rAF playback clock to an authoritative external clock (e.g. a
 * playing audio element's currentTime) to reduce audio/visual drift. Only takes
 * effect while playing; the running animate() loop picks up the new value on its
 * next frame.
 */
function syncToClock(ms: number): void {
    if (!isPlaying) return;
    assignCurrentTime(ms);
}

/**
 * Output duration, transitions included. Delegates to the selector so the
 * playback clock stops at the same instant the exported file ends; summing raw
 * scene durations here is what made the preview outlive the render.
 */
function getTotalDuration(): number {
    return getTotalDurationMs(projectStore.project);
}

function getCurrentSceneIndex(): number {
    return getSceneIndexAtMs(projectStore.project, currentTimeMs);
}

function getCurrentScene(): Scene | null {
    const project = projectStore.project;
    if (!project?.scenes?.length) return null;
    const index = getCurrentSceneIndex();
    return index >= 0 ? project.scenes[index] : null;
}

function seekToScene(sceneIndex: number): void {
    const starts = getSceneStartsMs(projectStore.project);
    if (starts.length === 0) return;

    const index = Math.max(0, Math.min(sceneIndex, starts.length - 1));
    setCurrentTime(starts[index]);
}

/**
 * Register the clock playback should follow, or null to remove it.
 *
 * The preview's audio engine registers here so the picture follows the
 * `AudioContext` rather than the other way round. Only ONE source is held: a
 * second registration replaces the first, because two authorities is exactly
 * the arrangement this replaced.
 */
function setClockSource(source: ClockSource | null): void {
    clockSource = source;
}

/**
 * Read the external clock, if one can answer for this frame.
 *
 * A source that throws is treated as absent rather than allowed to kill the
 * rAF loop: losing audio is survivable, losing playback is not.
 */
function externalClockMs(): number | null {
    if (!clockSource) return null;

    try {
        const ms = clockSource();

        return typeof ms === 'number' && Number.isFinite(ms) ? ms : null;
    } catch {
        return null;
    }
}

/**
 * The playback loop. It no longer OWNS the time — when an external clock is
 * registered and answering, the loop only samples it and repaints against it —
 * but it stays the rAF wall clock whenever nothing else can say, which is the
 * whole of a silent project's playback and any project whose `AudioContext` the
 * browser has not let start.
 */
function animate(timestamp: number): void {
    if (!isPlaying) return;

    const externalMs = externalClockMs();

    if (externalMs !== null) {
        const totalDuration = getTotalDuration();

        if (externalMs >= totalDuration) {
            assignCurrentTime(totalDuration);
            pause();
            return;
        }

        syncToClock(externalMs);
    } else if (lastFrameTime !== null) {
        const deltaMs = (timestamp - lastFrameTime) * playbackRate;
        const newTime = currentTimeMs + deltaMs;
        const totalDuration = getTotalDuration();

        if (newTime >= totalDuration) {
            assignCurrentTime(totalDuration);
            pause();
            return;
        }

        assignCurrentTime(newTime);
    }

    // Kept current even while an external clock is driving, so a source that
    // drops out mid-playback resumes wall-clock stepping from this frame
    // instead of jumping by however long the audio was in charge.
    lastFrameTime = timestamp;
    animationFrameId = requestAnimationFrame(animate);
}

function play(): void {
    if (isPlaying) return;

    const totalDuration = getTotalDuration();
    if (currentTimeMs >= totalDuration) {
        assignCurrentTime(0);
    }

    isPlaying = true;
    lastFrameTime = null;
    animationFrameId = requestAnimationFrame(animate);
}

function pause(): void {
    isPlaying = false;
    if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    lastFrameTime = null;
}

function togglePlayback(): void {
    if (isPlaying) {
        pause();
    } else {
        play();
    }
}

function setPlaybackRate(rate: number): void {
    playbackRate = Math.max(0.25, Math.min(2, rate));
}

function setZoom(newZoom: number): void {
    zoom = Math.max(0.1, Math.min(10, newZoom));
}

/**
 * Step the playhead by whole frames using the project's fps (default 30).
 * Frame stepping is a paused-only operation, so playback stops first.
 */
function stepFrames(frames: number): void {
    if (isPlaying) {
        pause();
    }

    const fps = projectStore.project?.fps || 30;
    setCurrentTime(currentTimeMs + (frames * 1000) / fps);
}

export function createTimelineStore(): TimelineStore {
    return {
        get currentTimeMs() {
            return currentTimeMs;
        },
        get isPlaying() {
            return isPlaying;
        },
        get playbackRate() {
            return playbackRate;
        },
        get zoom() {
            return zoom;
        },
        get pixelsPerMs() {
            return getPixelsPerMs();
        },
        setCurrentTime,
        syncToClock,
        play,
        pause,
        togglePlayback,
        setPlaybackRate,
        setZoom,
        stepFrames,
        seekToScene,
        setClockSource,
        getCurrentScene,
        getCurrentSceneIndex,
        getTotalDuration,
        onCurrentSceneChange,
    };
}

export const timelineStore = createTimelineStore();
