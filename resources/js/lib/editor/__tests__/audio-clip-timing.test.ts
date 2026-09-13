import { describe, expect, it } from 'vitest';
import type { AudioClip, AudioTrack } from '@/types';
import {
    normalizeAudioClip,
    normalizeAudioTrack,
    syncAudioClipTiming,
} from '../normalize';

function clip(partial: Partial<AudioClip>): AudioClip {
    return { id: 'c1', asset_id: 96, volume: 1, ...partial } as AudioClip;
}

describe('audio clip timing normalisation', () => {
    it('derives duration_ms from an agent-written end_ms', () => {
        // The exact shape compose_video_project writes: absolute timing, no
        // duration_ms. This read back as undefined and rendered NaN:NaN.NaN.
        const normalized = normalizeAudioClip(
            clip({ start_ms: 0, end_ms: 20000 }),
        );

        expect(normalized.duration_ms).toBe(20000);
        expect(normalized.end_ms).toBe(20000);
    });

    it('respects a non-zero start when deriving duration', () => {
        const normalized = normalizeAudioClip(
            clip({ start_ms: 4000, end_ms: 20000 }),
        );

        expect(normalized.duration_ms).toBe(16000);
    });

    it('derives end_ms from a legacy duration_ms clip', () => {
        const normalized = normalizeAudioClip(
            clip({ start_ms: 1000, duration_ms: 5000 }),
        );

        expect(normalized.end_ms).toBe(6000);
    });

    it('never produces NaN for a clip with no usable timing', () => {
        const normalized = normalizeAudioClip(clip({}));

        expect(Number.isFinite(normalized.duration_ms)).toBe(true);
        expect(Number.isFinite(normalized.end_ms as number)).toBe(true);
        expect(normalized.duration_ms).toBeGreaterThan(0);
    });

    it('ignores an end_ms that precedes the start rather than going negative', () => {
        const normalized = normalizeAudioClip(
            clip({ start_ms: 8000, end_ms: 2000, duration_ms: 3000 }),
        );

        expect(normalized.duration_ms).toBe(3000);
        expect(normalized.end_ms).toBe(11000);
    });

    it('fills volume and trim defaults', () => {
        const normalized = normalizeAudioClip(
            { id: 'c1', asset_id: 96, start_ms: 0, end_ms: 1000 } as AudioClip,
        );

        expect(normalized.volume).toBe(1);
        expect(normalized.trim_start_ms).toBe(0);
    });

    it('normalises every clip on a track', () => {
        const track = normalizeAudioTrack({
            id: 't1',
            clips: [clip({ start_ms: 0, end_ms: 20000 })],
        } as unknown as AudioTrack);

        expect(track.clips[0].duration_ms).toBe(20000);
        expect(track.name).toBe('Track 1');
    });
});

describe('syncAudioClipTiming', () => {
    it('lets duration win by default so a drag is not undone by a stale end', () => {
        const synced = syncAudioClipTiming(
            clip({ start_ms: 0, duration_ms: 3000, end_ms: 20000 }),
        );

        expect(synced.end_ms).toBe(3000);
    });

    it('lets end win when the caller wrote end', () => {
        const synced = syncAudioClipTiming(
            clip({ start_ms: 0, duration_ms: 3000, end_ms: 9000 }),
            'end',
        );

        expect(synced.duration_ms).toBe(9000);
    });

    it('keeps the mirror exact after a move', () => {
        const moved = syncAudioClipTiming(
            clip({ start_ms: 5000, duration_ms: 3000, end_ms: 3000 }),
        );

        expect(moved.end_ms).toBe(8000);
    });
});
