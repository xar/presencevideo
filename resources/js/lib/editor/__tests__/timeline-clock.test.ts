import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { projectStore } from '../project.svelte';
import { timelineStore } from '../timeline.svelte';
import { makeProject, makeScene } from './fixtures';

/**
 * The handoff between the audio master clock and the rAF wall clock.
 *
 * Playback must behave identically to before when nothing authoritative is
 * registered — a silent project, or a browser that never let the
 * `AudioContext` start — so both paths are exercised here rather than only the
 * new one.
 */

type Frame = (timestamp: number) => void;

let frames: Frame[] = [];

/** Run every pending animation frame once, at `timestamp`. */
function advanceFrame(timestamp: number): void {
    const pending = frames;
    frames = [];
    for (const frame of pending) {
        frame(timestamp);
    }
}

beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (callback: Frame) => {
        frames.push(callback);

        return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {
        frames = [];
    });

    projectStore.setProject(
        makeProject({
            scenes: [makeScene({ duration_ms: 10000 })],
            audio_tracks: [],
        }),
    );
    timelineStore.setClockSource(null);
    timelineStore.pause();
    timelineStore.setPlaybackRate(1);
    timelineStore.setCurrentTime(0);
});

afterEach(() => {
    timelineStore.setClockSource(null);
    timelineStore.pause();
    vi.unstubAllGlobals();
});

describe('timeline clock', () => {
    it('advances on the rAF wall clock when nothing else can say', () => {
        timelineStore.play();

        advanceFrame(1000);
        expect(timelineStore.currentTimeMs).toBe(0); // first frame only anchors
        advanceFrame(1500);
        expect(timelineStore.currentTimeMs).toBe(500);
    });

    it('scales the wall clock by the playback rate', () => {
        timelineStore.setPlaybackRate(2);
        timelineStore.play();

        advanceFrame(1000);
        advanceFrame(1500);
        expect(timelineStore.currentTimeMs).toBe(1000);
    });

    it('follows a registered clock source instead of wall time', () => {
        let audioMs = 0;
        timelineStore.setClockSource(() => audioMs);
        timelineStore.play();

        audioMs = 2500;
        advanceFrame(16);
        expect(timelineStore.currentTimeMs).toBe(2500);

        // Wall time moved by one frame; the audio clock moved by a second, and
        // the audio clock is the one that counts.
        audioMs = 3500;
        advanceFrame(32);
        expect(timelineStore.currentTimeMs).toBe(3500);
    });

    it('falls back to the wall clock when the source returns null', () => {
        let audioMs: number | null = null;
        timelineStore.setClockSource(() => audioMs);
        timelineStore.play();

        advanceFrame(1000);
        advanceFrame(1200);
        expect(timelineStore.currentTimeMs).toBe(200);

        // Audio takes over mid-playback.
        audioMs = 5000;
        advanceFrame(1400);
        expect(timelineStore.currentTimeMs).toBe(5000);

        // ...and drops out again; stepping resumes from the current position
        // rather than jumping by everything that elapsed meanwhile.
        audioMs = null;
        advanceFrame(1600);
        expect(timelineStore.currentTimeMs).toBe(5200);
    });

    it('survives a clock source that throws', () => {
        timelineStore.setClockSource(() => {
            throw new Error('context died');
        });
        timelineStore.play();

        advanceFrame(1000);
        advanceFrame(1200);
        expect(timelineStore.isPlaying).toBe(true);
        expect(timelineStore.currentTimeMs).toBe(200);
    });

    it('stops at the end of the project on either clock', () => {
        timelineStore.setClockSource(() => 99999);
        timelineStore.play();

        advanceFrame(16);
        expect(timelineStore.isPlaying).toBe(false);
        expect(timelineStore.currentTimeMs).toBe(10000);
    });

    it('keeps syncToClock a no-op while paused', () => {
        timelineStore.setCurrentTime(1000);
        timelineStore.syncToClock(5000);
        expect(timelineStore.currentTimeMs).toBe(1000);
    });
});
