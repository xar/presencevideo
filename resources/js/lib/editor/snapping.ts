import type { Project } from '@/types';
import { getSceneBoundariesMs } from './selectors';

export type SnapOptions = {
    excludeVideoClipId?: string;
    excludeAudioClipId?: string;
    playheadMs?: number;
};

/**
 * Collect all meaningful timeline positions (in ms) that a dragged edge can
 * snap to: timeline start, total duration, the playhead, cumulative scene
 * boundaries, and every video/audio clip's start & end (excluding the clip
 * currently being manipulated).
 */
export function collectSnapPoints(
    project: Project | null,
    opts: SnapOptions = {},
): number[] {
    if (!project) {
        return [];
    }

    const points = new Set<number>();
    points.add(0);

    // Scene boundaries come from the one transition-aware selector; summing raw
    // durations here snapped clips to positions the render does not have.
    for (const boundaryMs of getSceneBoundariesMs(project)) {
        points.add(boundaryMs);
    }

    if (opts.playheadMs != null && Number.isFinite(opts.playheadMs)) {
        points.add(Math.round(opts.playheadMs));
    }

    for (const track of project.video_tracks ?? []) {
        for (const clip of track.clips) {
            if (clip.id === opts.excludeVideoClipId) {
                continue;
            }
            points.add(clip.start_ms);
            points.add(clip.start_ms + clip.duration_ms);
        }
    }

    for (const track of project.audio_tracks ?? []) {
        for (const clip of track.clips) {
            if (clip.id === opts.excludeAudioClipId) {
                continue;
            }
            points.add(clip.start_ms);
            points.add(clip.start_ms + clip.duration_ms);
        }
    }

    return Array.from(points).sort((a, b) => a - b);
}

/**
 * Snap a millisecond value to the nearest snap point when it is within
 * `thresholdPx` pixels at the current zoom level.
 */
export function applySnap(
    ms: number,
    snapPoints: number[],
    pixelsPerMs: number,
    thresholdPx = 8,
): { ms: number; snapped: boolean } {
    let bestMs = ms;
    let bestDistPx = Infinity;

    for (const point of snapPoints) {
        const distPx = Math.abs(point - ms) * pixelsPerMs;
        if (distPx < bestDistPx) {
            bestDistPx = distPx;
            bestMs = point;
        }
    }

    if (bestDistPx <= thresholdPx) {
        return { ms: bestMs, snapped: true };
    }

    return { ms, snapped: false };
}
