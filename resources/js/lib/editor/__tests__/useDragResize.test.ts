import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { historyStore } from '../history.svelte';
import { useDragResize } from '../useDragResize.svelte';

const down = (x: number, y: number, init: MouseEventInit = {}) =>
    new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y, button: 0, ...init });
const move = (x: number, y: number, init: MouseEventInit = {}) =>
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, ...init }));
const up = (x: number, y: number) => window.dispatchEvent(new MouseEvent('mouseup', { clientX: x, clientY: y }));

describe('useDragResize', () => {
    let rect = { x: 100, y: 100, width: 200, height: 100 };

    beforeEach(() => {
        rect = { x: 100, y: 100, width: 200, height: 100 };
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
            cb(0);
            return 1;
        });
        vi.stubGlobal('cancelAnimationFrame', () => {});
        historyStore.clear();
    });

    afterEach(() => vi.unstubAllGlobals());

    function build(extra: Partial<Parameters<typeof useDragResize>[0]> = {}) {
        return useDragResize({
            getPosition: () => rect,
            onUpdate: (u) => Object.assign(rect, u),
            scale: () => 0.5, // canvas shown at half size
            ...extra,
        });
    }

    it('moves in project pixels, dividing by the canvas scale', () => {
        const d = build();
        d.handleMouseDown(down(0, 0));
        move(10, 20);
        expect(rect).toMatchObject({ x: 120, y: 140 });
        up(10, 20);
        expect(d.isDragging).toBe(false);
    });

    it('resizes from a corner and honours minimum size', () => {
        const d = build({ minWidth: 40, minHeight: 40 });
        d.handleResizeStart('bottom-right', down(0, 0));
        expect(d.isResizing).toBe('bottom-right');

        move(50, 50); // +100 project px
        expect(rect).toEqual({ x: 100, y: 100, width: 300, height: 200 });

        move(-500, -500);
        expect(rect).toEqual({ x: 100, y: 100, width: 40, height: 40 });
        up(-500, -500);
    });

    it('keeps the opposite edge anchored when resizing from the top-left', () => {
        const d = build();
        d.handleResizeStart('top-left', down(0, 0));
        move(10, 10); // +20 project px
        expect(rect).toEqual({ x: 120, y: 120, width: 180, height: 80 });
        up(10, 10);
    });

    it('locks aspect ratio with Shift', () => {
        const d = build();
        d.handleResizeStart('right', down(0, 0));
        move(50, 0, { shiftKey: true }); // width 300 → height 150
        expect(rect).toEqual({ x: 100, y: 100, width: 300, height: 150 });
        up(50, 0);
    });

    it('runs the snap pass with the modifier flags', () => {
        const requests: string[] = [];
        const d = build({
            snap: (req) => {
                requests.push(`${req.mode}:${req.handle}:${req.disabled}`);
                return { ...req.rect, x: 999 };
            },
        });
        d.handleMouseDown(down(0, 0));
        move(1, 1, { altKey: true });
        expect(rect.x).toBe(999);
        up(1, 1);
        expect(requests).toEqual(['move:null:true']);
    });

    it('owns the undo transaction and fires onGestureEnd once', () => {
        let ends = 0;
        const d = build({ onGestureEnd: () => ends++ });
        d.handleMouseDown(down(0, 0));
        expect(historyStore.batchDepth).toBe(1);
        move(1, 1);
        d.cleanup();
        up(1, 1);
        expect(ends).toBe(1);
        expect(historyStore.batchDepth).toBe(0);
    });
});
