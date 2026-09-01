import { historyStore  } from './history.svelte';
import type {TransactionHandle} from './history.svelte';
import { applySnap } from './snapping';
import {
    createPointerGesture
    
    
} from './usePointerGesture.svelte';
import type {GesturePoint, PointerGesture} from './usePointerGesture.svelte';

export type TimelineSpan = { start_ms: number; duration_ms: number };
export type TimelineGestureKind = 'move' | 'trim-start' | 'trim-end';

export type TimelineGestureOptions = {
    getSpan: () => TimelineSpan;
    pixelsPerMs: () => number;
    /** Snap targets in ms, sampled once when the gesture starts. */
    snapPoints?: () => number[];
    /** Magnet radius in on-screen pixels. */
    snapThresholdPx?: number;
    minDurationMs?: number;
    onUpdate: (updates: Partial<TimelineSpan>) => void;
    /** Pointer position on every coalesced move — e.g. for cross-track hit-testing. */
    onMove?: (point: GesturePoint, kind: TimelineGestureKind) => void;
    /**
     * Fired on release, inside the same undo step as the drag itself, so a
     * follow-up mutation (moving to another track) is undone together with it.
     */
    onEnd?: (point: GesturePoint | null, kind: TimelineGestureKind) => void;
};

export type TimelineGesture = {
    readonly isDragging: boolean;
    readonly trimming: 'start' | 'end' | null;
    readonly active: boolean;
    startMove: (e: MouseEvent) => void;
    startTrim: (side: 'start' | 'end', e: MouseEvent) => void;
    cleanup: () => void;
};

type GestureState = {
    kind: TimelineGestureKind;
    originX: number;
    startMs: number;
    durationMs: number;
    snapPoints: number[];
    tx: TransactionHandle;
};

/**
 * Move and trim for any block on the timeline (overlay clips, audio clips).
 *
 * Owns the history transaction for the gesture, so callers never touch
 * `beginBatch`/`endBatch` and can't unbalance them. Snapping follows the
 * timeline convention: dragging snaps whichever edge is closest to a target;
 * trimming snaps the edge being trimmed; holding Alt disables snapping.
 */
export function useTimelineGesture(options: TimelineGestureOptions): TimelineGesture {
    const minDuration = options.minDurationMs ?? 100;
    let pendingKind: TimelineGestureKind = 'move';
    let activeKind = $state<TimelineGestureKind | null>(null);

    const gesture: PointerGesture = createPointerGesture<GestureState>({
        onStart(e) {
            const span = options.getSpan();
            const kind = pendingKind;

            if (kind !== 'move') e.preventDefault();
            activeKind = kind;

            return {
                kind,
                originX: e.clientX,
                startMs: span.start_ms,
                durationMs: span.duration_ms,
                snapPoints: options.snapPoints?.() ?? [],
                tx: historyStore.beginTransaction(),
            };
        },
        onMove(point, state) {
            apply(point, state);
            options.onMove?.(point, state.kind);
        },
        onEnd(point, state) {
            activeKind = null;
            try {
                options.onEnd?.(point, state.kind);
            } finally {
                state.tx.end();
            }
        },
    });

    function snap(ms: number, point: GesturePoint, snapPoints: number[]): number {
        if (point.altKey) return ms;
        const result = applySnap(ms, snapPoints, options.pixelsPerMs(), options.snapThresholdPx);
        return result.snapped ? result.ms : ms;
    }

    function apply(point: GesturePoint, state: GestureState) {
        const deltaMs = (point.clientX - state.originX) / options.pixelsPerMs();

        if (state.kind === 'move') {
            let start = Math.max(0, state.startMs + deltaMs);
            if (!point.altKey) {
                const startSnap = applySnap(start, state.snapPoints, options.pixelsPerMs(), options.snapThresholdPx);
                if (startSnap.snapped) {
                    start = startSnap.ms;
                } else {
                    const endSnap = applySnap(
                        start + state.durationMs,
                        state.snapPoints,
                        options.pixelsPerMs(),
                        options.snapThresholdPx,
                    );
                    if (endSnap.snapped) {
                        start = Math.max(0, endSnap.ms - state.durationMs);
                    }
                }
            }
            options.onUpdate({ start_ms: Math.round(start) });
            return;
        }

        if (state.kind === 'trim-start') {
            const start = snap(Math.max(0, state.startMs + deltaMs), point, state.snapPoints);
            const duration = state.durationMs - (start - state.startMs);
            if (duration < minDuration) {
                // Pin the start so the clip never shrinks below the minimum.
                const pinnedStart = state.startMs + state.durationMs - minDuration;
                options.onUpdate({ start_ms: Math.round(pinnedStart), duration_ms: minDuration });
                return;
            }
            options.onUpdate({ start_ms: Math.round(start), duration_ms: Math.round(duration) });
            return;
        }

        const end = snap(state.startMs + state.durationMs + deltaMs, point, state.snapPoints);
        const duration = Math.max(minDuration, end - state.startMs);
        options.onUpdate({ duration_ms: Math.round(duration) });
    }

    return {
        get isDragging() {
            return activeKind === 'move';
        },
        get trimming() {
            if (activeKind === 'trim-start') return 'start';
            if (activeKind === 'trim-end') return 'end';
            return null;
        },
        get active() {
            return gesture.active;
        },
        startMove(e) {
            pendingKind = 'move';
            gesture.start(e);
        },
        startTrim(side, e) {
            pendingKind = side === 'start' ? 'trim-start' : 'trim-end';
            gesture.start(e);
        },
        cleanup: gesture.cancel,
    };
}
