/**
 * Cached offscreen canvases.
 *
 * The compositor needs scratch surfaces for colour adjustment, for the two
 * frames of a transition and for the dissolve mask. Allocating those per frame
 * would mean megabytes of garbage every 16ms, so each named slot keeps its
 * canvas and only resizes when the requested size actually changes (resizing
 * also clears it, which is the behaviour every caller wants anyway).
 *
 * Canvas creation is feature-detected and may return null: this module is
 * imported by tests running under jsdom, where 2D contexts do not exist.
 */

export type Scratch = {
    canvas: HTMLCanvasElement | OffscreenCanvas;
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    width: number;
    height: number;
};

const slots = new Map<string, Scratch>();

function createCanvas(
    width: number,
    height: number,
): HTMLCanvasElement | OffscreenCanvas | null {
    if (typeof OffscreenCanvas !== 'undefined') {
        return new OffscreenCanvas(width, height);
    }

    if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        return canvas;
    }

    return null;
}

/**
 * Get the scratch surface registered under `key`, sized to at least the
 * requested extents. Returns null when no 2D context can be created.
 */
export function getScratch(
    key: string,
    width: number,
    height: number,
): Scratch | null {
    const w = Math.max(1, Math.ceil(width));
    const h = Math.max(1, Math.ceil(height));

    if (!Number.isFinite(w) || !Number.isFinite(h)) {
        return null;
    }

    const existing = slots.get(key);
    if (existing) {
        if (existing.width !== w || existing.height !== h) {
            existing.canvas.width = w;
            existing.canvas.height = h;
            existing.width = w;
            existing.height = h;
        } else {
            existing.ctx.clearRect(0, 0, w, h);
        }

        return existing;
    }

    const canvas = createCanvas(w, h);
    if (!canvas) {
        return null;
    }

    const ctx = canvas.getContext('2d') as
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D
        | null;

    if (!ctx) {
        return null;
    }

    const scratch: Scratch = { canvas, ctx, width: w, height: h };
    slots.set(key, scratch);

    return scratch;
}

/** Drop every cached surface. Used by tests and when a project is closed. */
export function releaseScratch(): void {
    slots.clear();
}
