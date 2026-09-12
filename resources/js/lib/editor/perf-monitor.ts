/**
 * Dev-only playback profiler. While the timeline plays it samples rAF frame
 * gaps and long main-thread tasks, then logs a compact summary line every two
 * seconds via console.warn — which the Laravel Boost browser-log hook captures,
 * so the numbers can be read back without opening devtools.
 *
 * Costs nothing in production builds: the caller gates on import.meta.env.DEV.
 */
import { timelineStore } from './timeline.svelte';

type WindowStats = {
    frames: number;
    worstGapMs: number;
    over25ms: number;
    over50ms: number;
    longTasks: number;
    longTaskTotalMs: number;
    worstLongTaskMs: number;
};

const freshStats = (): WindowStats => ({
    frames: 0,
    worstGapMs: 0,
    over25ms: 0,
    over50ms: 0,
    longTasks: 0,
    longTaskTotalMs: 0,
    worstLongTaskMs: 0,
});

export function startPlaybackPerfMonitor(): () => void {
    let stats = freshStats();
    let lastTick: number | null = null;
    let lastReport = performance.now();
    let frameId: number | null = null;

    let observer: PerformanceObserver | null = null;
    try {
        observer = new PerformanceObserver((list) => {
            if (!timelineStore.isPlaying) return;
            for (const entry of list.getEntries()) {
                stats.longTasks++;
                stats.longTaskTotalMs += entry.duration;
                stats.worstLongTaskMs = Math.max(stats.worstLongTaskMs, entry.duration);
            }
        });
        observer.observe({ type: 'longtask', buffered: false });
    } catch {
        observer = null;
    }

    function tick(now: number) {
        frameId = requestAnimationFrame(tick);

        if (!timelineStore.isPlaying) {
            lastTick = null;
            return;
        }

        if (lastTick !== null) {
            const gap = now - lastTick;
            stats.frames++;
            stats.worstGapMs = Math.max(stats.worstGapMs, gap);
            if (gap > 25) stats.over25ms++;
            if (gap > 50) stats.over50ms++;
        }
        lastTick = now;

        if (now - lastReport >= 2000 && stats.frames > 0) {
            const windowSec = (now - lastReport) / 1000;
            const fps = stats.frames / windowSec;
            console.warn(
                '[perf] playback '
                    + `fps=${fps.toFixed(1)} `
                    + `worstGap=${stats.worstGapMs.toFixed(0)}ms `
                    + `janky(>25ms)=${stats.over25ms} dropped(>50ms)=${stats.over50ms} `
                    + `longTasks=${stats.longTasks} (total=${stats.longTaskTotalMs.toFixed(0)}ms worst=${stats.worstLongTaskMs.toFixed(0)}ms)`,
            );
            stats = freshStats();
            lastReport = now;
        }
    }

    frameId = requestAnimationFrame(tick);

    return () => {
        if (frameId !== null) cancelAnimationFrame(frameId);
        observer?.disconnect();
    };
}
