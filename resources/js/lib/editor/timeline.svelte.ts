import type { Scene } from '@/types';
import { projectStore } from './project.svelte';

export type TimelineStore = {
    currentTimeMs: number;
    isPlaying: boolean;
    playbackRate: number;
    zoom: number;
    pixelsPerMs: number;
    setCurrentTime: (ms: number) => void;
    play: () => void;
    pause: () => void;
    togglePlayback: () => void;
    setPlaybackRate: (rate: number) => void;
    setZoom: (zoom: number) => void;
    seekToScene: (sceneIndex: number) => void;
    getCurrentScene: () => Scene | null;
    getCurrentSceneIndex: () => number;
    getTotalDuration: () => number;
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

function setCurrentTime(ms: number): void {
    const totalDuration = getTotalDuration();
    currentTimeMs = Math.max(0, Math.min(ms, totalDuration));
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
            currentTimeMs = totalDuration;
            pause();
            return;
        }

        currentTimeMs = newTime;
    }

    lastFrameTime = timestamp;
    animationFrameId = requestAnimationFrame(animate);
}

function play(): void {
    if (isPlaying) return;

    const totalDuration = getTotalDuration();
    if (currentTimeMs >= totalDuration) {
        currentTimeMs = 0;
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
        play,
        pause,
        togglePlayback,
        setPlaybackRate,
        setZoom,
        seekToScene,
        getCurrentScene,
        getCurrentSceneIndex,
        getTotalDuration,
    };
}

export const timelineStore = createTimelineStore();
