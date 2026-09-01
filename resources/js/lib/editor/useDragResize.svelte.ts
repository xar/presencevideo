import { historyStore  } from './history.svelte';
import type {TransactionHandle} from './history.svelte';
import {
    createPointerGesture
    
    
} from './usePointerGesture.svelte';
import type {GesturePoint, PointerGesture} from './usePointerGesture.svelte';

type Position = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type SnapRequest = {
    /** The unsnapped rect the raw pointer delta produced, in project px. */
    rect: Position;
    mode: 'move' | 'resize';
    /** Resize handle name ('top-left', 'right', …), null while moving. */
    handle: string | null;
    /** Shift is held, so the gesture is aspect-locked. */
    aspectLocked: boolean;
    /** Alt/Option is held — the user is explicitly asking for no snapping. */
    disabled: boolean;
};

type DragResizeOptions = {
    getPosition: () => Position;
    onUpdate: (updates: Partial<Position>) => void;
    scale?: () => number;
    minWidth?: number | (() => number);
    minHeight?: number | (() => number);
    /**
     * Optional alignment pass. Receives the raw rect and returns the rect to
     * actually commit; implementations also publish their guide lines.
     */
    snap?: (request: SnapRequest) => Position;
    /** Called once when a drag/resize actually begins. */
    onGestureStart?: () => void;
    /** Called exactly once when the gesture ends or is cancelled (clear guides, etc.). */
    onGestureEnd?: () => void;
};

type DragResizeState = {
    isDragging: boolean;
    isResizing: string | null;
    handleMouseDown: (e: MouseEvent) => void;
    handleResizeStart: (corner: string, e: MouseEvent) => void;
    cleanup: () => void;
};

type GestureState = {
    handle: string | null;
    originX: number;
    originY: number;
    pos: Position;
    tx: TransactionHandle;
};

/**
 * Move/resize for a rectangle on the scene canvas. Built on the shared
 * pointer-gesture core and owns its own undo transaction, so callers only
 * describe geometry.
 */
export function useDragResize(options: DragResizeOptions): DragResizeState {
    const resolve = (value: number | (() => number) | undefined, fallback: number) =>
        typeof value === 'function' ? value() : (value ?? fallback);

    let pendingHandle: string | null = null;
    let activeHandle = $state<string | null>(null);
    let isDragging = $state(false);

    const gesture: PointerGesture = createPointerGesture<GestureState>({
        onStart(e) {
            const handle = pendingHandle;
            if (handle !== null) e.preventDefault();

            isDragging = handle === null;
            activeHandle = handle;
            options.onGestureStart?.();

            return {
                handle,
                originX: e.clientX,
                originY: e.clientY,
                pos: { ...options.getPosition() },
                tx: historyStore.beginTransaction(),
            };
        },
        onMove(point, state) {
            if (state.handle === null) {
                applyMove(point, state);
            } else {
                applyResize(point, state, state.handle);
            }
        },
        onEnd(_point, state) {
            isDragging = false;
            activeHandle = null;
            try {
                options.onGestureEnd?.();
            } finally {
                state.tx.end();
            }
        },
    });

    function getScale(): number {
        return options.scale?.() ?? 1;
    }

    function runSnap(rect: Position, mode: 'move' | 'resize', handle: string | null, point: GesturePoint): Position {
        if (!options.snap) return rect;

        return options.snap({
            rect,
            mode,
            handle,
            aspectLocked: point.shiftKey,
            disabled: point.altKey,
        });
    }

    function applyMove(point: GesturePoint, state: GestureState) {
        const s = getScale();
        const deltaX = (point.clientX - state.originX) / s;
        const deltaY = (point.clientY - state.originY) / s;

        const snapped = runSnap(
            {
                x: state.pos.x + deltaX,
                y: state.pos.y + deltaY,
                width: state.pos.width,
                height: state.pos.height,
            },
            'move',
            null,
            point,
        );

        options.onUpdate({ x: Math.round(snapped.x), y: Math.round(snapped.y) });
    }

    function applyResize(point: GesturePoint, state: GestureState, handle: string) {
        const s = getScale();
        const deltaX = (point.clientX - state.originX) / s;
        const deltaY = (point.clientY - state.originY) / s;
        const { x: posX, y: posY, width: posW, height: posH } = state.pos;
        const minW = resolve(options.minWidth, 20);
        const minH = resolve(options.minHeight, 20);

        let newX = posX;
        let newY = posY;
        let newW = posW;
        let newH = posH;

        if (handle.includes('left')) {
            newX = posX + deltaX;
            newW = posW - deltaX;
        }
        if (handle.includes('right')) {
            newW = posW + deltaX;
        }
        if (handle.includes('top')) {
            newY = posY + deltaY;
            newH = posH - deltaY;
        }
        if (handle.includes('bottom')) {
            newH = posH + deltaY;
        }

        const aspectLocked = point.shiftKey && posW > 0 && posH > 0;

        if (aspectLocked) {
            const aspectRatio = posW / posH;
            const isHorizontalHandle = handle === 'left' || handle === 'right';
            const isVerticalHandle = handle === 'top' || handle === 'bottom';

            if (isHorizontalHandle || Math.abs(newW - posW) >= Math.abs(newH - posH)) {
                newH = newW / aspectRatio;
            } else if (isVerticalHandle || Math.abs(newH - posH) > Math.abs(newW - posW)) {
                newW = newH * aspectRatio;
            }

            if (handle.includes('left')) {
                newX = posX + posW - newW;
            }
            if (handle.includes('top')) {
                newY = posY + posH - newH;
            }
        }

        if (newW < minW) {
            if (aspectLocked) {
                newH = minW / (posW / posH);
            }
            if (handle.includes('left')) {
                newX = posX + posW - minW;
            }
            if (handle.includes('top') && aspectLocked) {
                newY = posY + posH - newH;
            }
            newW = minW;
        }
        if (newH < minH) {
            if (aspectLocked) {
                newW = minH * (posW / posH);
            }
            if (handle.includes('top')) {
                newY = posY + posH - minH;
            }
            if (handle.includes('left') && aspectLocked) {
                newX = posX + posW - newW;
            }
            newH = minH;
        }

        const snapped = runSnap({ x: newX, y: newY, width: newW, height: newH }, 'resize', handle, point);

        options.onUpdate({
            x: Math.round(snapped.x),
            y: Math.round(snapped.y),
            width: Math.round(snapped.width),
            height: Math.round(snapped.height),
        });
    }

    return {
        get isDragging() {
            return isDragging;
        },
        get isResizing() {
            return activeHandle;
        },
        handleMouseDown(e) {
            pendingHandle = null;
            gesture.start(e);
        },
        handleResizeStart(corner, e) {
            pendingHandle = corner;
            gesture.start(e);
        },
        cleanup: gesture.cancel,
    };
}
