/**
 * The one place a pointer gesture (press → move… → release) is wired to the
 * DOM. Every drag, trim and resize in the editor is built on this so pointer
 * capture, move coalescing and teardown behave identically everywhere.
 *
 * - Pointer events capture the pointer on the pressed element, so a pointer
 *   that leaves the window keeps delivering moves. Plain mouse events (e.g.
 *   from `onmousedown` handlers) fall back to window listeners.
 * - Moves are coalesced to one `onMove` per animation frame, and the last
 *   pending move is flushed before `onEnd` so nothing is dropped.
 * - `onEnd` runs exactly once per gesture, whether it ended by release,
 *   cancel, or the owner tearing the gesture down mid-drag.
 */

export type GestureModifiers = {
    shiftKey: boolean;
    altKey: boolean;
    metaKey: boolean;
    ctrlKey: boolean;
};

export type GesturePoint = GestureModifiers & {
    clientX: number;
    clientY: number;
};

export type PointerGestureCallbacks<S> = {
    /**
     * Called on press. Return the gesture's private state, or `null` to
     * decline the gesture (nothing else fires).
     */
    onStart: (e: MouseEvent) => S | null;
    /** Called at most once per animation frame while the pointer moves. */
    onMove: (point: GesturePoint, state: S) => void;
    /**
     * Called exactly once when the gesture ends. `point` is the last known
     * pointer position (null when torn down without any move).
     */
    onEnd: (point: GesturePoint | null, state: S) => void;
};

export type PointerGesture = {
    readonly active: boolean;
    /** Start from a pointerdown/mousedown handler. Ignores non-primary buttons. */
    start: (e: MouseEvent) => void;
    /** Force-end the gesture (component teardown). Safe to call when idle. */
    cancel: () => void;
};

export function toGesturePoint(e: MouseEvent): GesturePoint {
    return {
        clientX: e.clientX,
        clientY: e.clientY,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
    };
}

export function createPointerGesture<S>(callbacks: PointerGestureCallbacks<S>): PointerGesture {
    let active = $state(false);
    let gestureState: S | null = null;
    let lastPoint: GesturePoint | null = null;
    let pendingPoint: GesturePoint | null = null;
    let frameId: number | null = null;
    /**
     * Tracked separately from `frameId`: a synchronous rAF (tests, some
     * polyfills) runs the callback before the id is even assigned.
     */
    let frameScheduled = false;

    let captureEl: Element | null = null;
    let capturedPointerId: number | null = null;

    function resolveCaptureElement(e: MouseEvent): Element | null {
        if (e.currentTarget instanceof Element) return e.currentTarget;
        if (e.target instanceof Element) return e.target;
        return null;
    }

    function attach(e: MouseEvent) {
        const pointerId =
            typeof PointerEvent !== 'undefined' && e instanceof PointerEvent ? e.pointerId : null;
        const element = pointerId !== null ? resolveCaptureElement(e) : null;

        if (pointerId !== null && element && typeof element.setPointerCapture === 'function') {
            try {
                element.setPointerCapture(pointerId);
                captureEl = element;
                capturedPointerId = pointerId;
                element.addEventListener('pointermove', onPointerMove);
                element.addEventListener('pointerup', onRelease);
                element.addEventListener('pointercancel', onRelease);
                return;
            } catch {
                captureEl = null;
                capturedPointerId = null;
            }
        }

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onRelease);
    }

    function detach() {
        if (captureEl && capturedPointerId !== null) {
            captureEl.removeEventListener('pointermove', onPointerMove);
            captureEl.removeEventListener('pointerup', onRelease);
            captureEl.removeEventListener('pointercancel', onRelease);
            try {
                if (captureEl.hasPointerCapture?.(capturedPointerId)) {
                    captureEl.releasePointerCapture(capturedPointerId);
                }
            } catch {
                // Pointer already gone; nothing to release.
            }
        }
        captureEl = null;
        capturedPointerId = null;

        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onRelease);
    }

    function onPointerMove(e: Event) {
        const event = e as PointerEvent;
        if (capturedPointerId !== null && event.pointerId !== capturedPointerId) return;
        onMouseMove(event);
    }

    function onMouseMove(e: MouseEvent) {
        pendingPoint = toGesturePoint(e);
        if (frameScheduled) return;

        frameScheduled = true;
        frameId = requestAnimationFrame(() => {
            frameScheduled = false;
            frameId = null;
            flush();
        });
    }

    function flush() {
        if (frameId !== null) {
            cancelAnimationFrame(frameId);
            frameId = null;
        }
        frameScheduled = false;
        const point = pendingPoint;
        pendingPoint = null;
        if (point && active && gestureState !== null) {
            lastPoint = point;
            callbacks.onMove(point, gestureState);
        }
    }

    function onRelease(e: Event) {
        // A press-and-release with no move still hands `onEnd` a position.
        if (e instanceof MouseEvent && lastPoint === null && pendingPoint === null) {
            lastPoint = toGesturePoint(e);
        }
        finish();
    }

    function finish() {
        if (!active) return;
        flush();

        const state = gestureState as S;
        active = false;
        gestureState = null;
        detach();

        const point = lastPoint;
        lastPoint = null;
        callbacks.onEnd(point, state);
    }

    function start(e: MouseEvent) {
        if (e.button !== 0 || active) return;

        const state = callbacks.onStart(e);
        if (state === null) return;

        e.stopPropagation();
        gestureState = state;
        lastPoint = null;
        active = true;
        attach(e);
    }

    function cancel() {
        if (frameId !== null) {
            cancelAnimationFrame(frameId);
            frameId = null;
        }
        frameScheduled = false;
        pendingPoint = null;
        finish();
    }

    return {
        get active() {
            return active;
        },
        start,
        cancel,
    };
}
