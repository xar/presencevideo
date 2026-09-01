import type { Scene } from '@/types';
import { projectStore } from './project.svelte';

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

function getTotalDuration(): number {
    const project = projectStore.project;
    if (!project?.scenes?.length) return 0;
    return project.scenes.reduce((sum, scene) => sum + scene.duration_ms, 0);
}

function getCurrentSceneIndex(): number {
    const project = projectStore.project;
    if (!project?.scenes?.length) return -1;

    let accumulated = 0;
    for (let i = 0; i < project.scenes.length; i++) {
        accumulated += project.scenes[i].duration_ms;
        if (currentTimeMs < accumulated) {
            return i;
        }
    }
    return project.scenes.length - 1;
}

function getCurrentScene(): Scene | null {
    const project = projectStore.project;
    if (!project?.scenes?.length) return null;
    const index = getCurrentSceneIndex();
    return index >= 0 ? project.scenes[index] : null;
}

function seekToScene(sceneIndex: number): void {
    const project = projectStore.project;
    if (!project?.scenes?.length) return;

    let time = 0;
    for (let i = 0; i < sceneIndex && i < project.scenes.length; i++) {
        time += project.scenes[i].duration_ms;
    }
    setCurrentTime(time);
}

function animate(timestamp: number): void {
    if (!isPlaying) return;

    if (lastFrameTime !== null) {
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
        getCurrentScene,
        getCurrentSceneIndex,
        getTotalDuration,
        onCurrentSceneChange,
    };
}

export const timelineStore = createTimelineStore();
