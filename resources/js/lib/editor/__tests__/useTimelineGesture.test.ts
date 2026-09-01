import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { historyStore } from '../history.svelte';
import { useTimelineGesture } from '../useTimelineGesture.svelte';

function press(el: HTMLElement, x: number, init: MouseEventInit = {}) {
    const e = new MouseEvent('mousedown', { bubbles: true, clientX: x, button: 0, ...init });
    return e;
}

function move(x: number, init: MouseEventInit = {}) {
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: x, ...init }));
}

function release(x: number) {
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: x }));
}

describe('useTimelineGesture', () => {
    let span = { start_ms: 1000, duration_ms: 2000 };
    let updates: Array<Partial<typeof span>>;
    let el: HTMLElement;

    beforeEach(() => {
        span = { start_ms: 1000, duration_ms: 2000 };
        updates = [];
        el = document.createElement('div');
        document.body.appendChild(el);
        // Run coalesced moves synchronously so assertions can follow each event.
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
            cb(0);
            return 1;
        });
        vi.stubGlobal('cancelAnimationFrame', () => {});
        historyStore.clear();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        el.remove();
    });

    function build(extra: Partial<Parameters<typeof useTimelineGesture>[0]> = {}) {
        return useTimelineGesture({
            getSpan: () => span,
            pixelsPerMs: () => 0.1, // 100px per second
            onUpdate: (u) => {
                updates.push(u);
                Object.assign(span, u);
            },
            ...extra,
        });
    }

    it('moves the block by the pointer delta and clamps at zero', () => {
        const g = build();
        g.startMove(press(el, 100));
        expect(g.isDragging).toBe(true);

        move(150); // +50px = +500ms
        expect(span.start_ms).toBe(1500);

        move(-100); // -200px = -2000ms → clamped
        expect(span.start_ms).toBe(0);

        release(-100);
        expect(g.isDragging).toBe(false);
        expect(g.active).toBe(false);
    });

    it('trims the start without shrinking below the minimum duration', () => {
        const g = build({ minDurationMs: 100 });
        g.startTrim('start', press(el, 0));
        expect(g.trimming).toBe('start');

        move(50); // +500ms
        expect(span).toEqual({ start_ms: 1500, duration_ms: 1500 });

        move(1000); // way past the end → pinned to min duration at the clip's end
        expect(span).toEqual({ start_ms: 2900, duration_ms: 100 });
        release(1000);
    });

    it('trims the end and snaps to a nearby point unless Alt is held', () => {
        const g = build({ snapPoints: () => [3040], snapThresholdPx: 8 });
        g.startTrim('end', press(el, 0));

        move(1); // end 3000 → 3010; 3040 is 3px away → snaps
        expect(span.duration_ms).toBe(2040);

        move(1, { altKey: true });
        expect(span.duration_ms).toBe(2010);
        release(1);
    });

    it('snaps a moved block by whichever edge is closer to a target', () => {
        const g = build({ snapPoints: () => [5020], snapThresholdPx: 8 });
        g.startMove(press(el, 0));

        move(200); // start 3000, end 5000; end is 2px from 5020 → snap end
        expect(span.start_ms).toBe(3020);
        release(200);
    });

    it('wraps the whole gesture, including onEnd work, in one undo step', () => {
        const ended: string[] = [];
        const g = build({
            onEnd: (_p, kind) => {
                ended.push(kind);
                expect(historyStore.batchDepth).toBe(1);
            },
        });

        g.startMove(press(el, 0));
        move(10);
        move(20);
        release(20);

        expect(ended).toEqual(['move']);
        expect(historyStore.batchDepth).toBe(0);
    });

    it('cleanup mid-gesture ends exactly once and leaves history balanced', () => {
        let ends = 0;
        const g = build({ onEnd: () => ends++ });

        g.startMove(press(el, 0));
        move(10);
        g.cleanup();
        g.cleanup();
        release(10); // stale release after teardown must be ignored

        expect(ends).toBe(1);
        expect(g.active).toBe(false);
        expect(historyStore.batchDepth).toBe(0);
    });

    it('ignores non-primary buttons and re-entrant starts', () => {
        const g = build();
        g.startMove(press(el, 0, { button: 2 }));
        expect(g.active).toBe(false);

        g.startMove(press(el, 0));
        g.startTrim('end', press(el, 0));
        expect(g.trimming).toBe(null);
        expect(g.isDragging).toBe(true);
        release(0);
    });

    it('reports pointer positions to onMove only for body drags', () => {
        const seen: string[] = [];
        const g = build({ onMove: (_p, kind) => seen.push(kind) });

        g.startTrim('end', press(el, 0));
        move(5);
        release(5);
        g.startMove(press(el, 0));
        move(5);
        release(5);

        expect(seen).toEqual(['trim-end', 'move']);
    });
});
