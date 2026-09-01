/**
 * CapCut-style 2D alignment snapping for the scene canvas.
 *
 * All geometry here is in *project* pixels (the canvas' own coordinate space),
 * never screen pixels. Callers convert the screen-space threshold with
 * `screenThresholdToProject()` so the magnet always feels the same size on
 * screen regardless of the current canvas zoom.
 *
 * Rotation is deliberately ignored: the editor's drag/resize math is unrotated,
 * so snapping works on the axis-aligned box exactly like the handles do.
 */

export type SnapRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type GuideKind = 'canvas-center' | 'canvas-edge' | 'rect';

export type Guide = {
    orientation: 'v' | 'h';
    /** Position along the guide's axis (x for 'v', y for 'h'), in project px. */
    position: number;
    /** Span of the guide along the *other* axis, in project px. */
    from: number;
    to: number;
    kind: GuideKind;
};

export type SnapContext = {
    canvasWidth: number;
    canvasHeight: number;
    /** Other visible rects on the canvas (excluding the one being manipulated). */
    others: SnapRect[];
    /** Magnet radius in project px — see `screenThresholdToProject()`. */
    thresholdPx: number;
    minWidth?: number;
    minHeight?: number;
};

export type SnapResult = SnapRect & { guides: Guide[] };

type SnapTarget = {
    position: number;
    from: number;
    to: number;
    kind: GuideKind;
};

/** Magnet radius, in on-screen pixels. */
export const SNAP_SCREEN_PX = 6;

/** Two positions closer than this (project px) are treated as aligned. */
const ALIGN_EPSILON = 0.5;

/**
 * Convert the on-screen magnet radius into project pixels for a given canvas
 * scale. A zoomed-out canvas needs a *larger* project-px threshold to feel the
 * same under the cursor.
 */
export function screenThresholdToProject(canvasScale: number, screenPx = SNAP_SCREEN_PX): number {
    const scale = canvasScale > 0 ? canvasScale : 1;
    return screenPx / scale;
}

/**
 * Snap targets are ordered canvas-first so that a tie between "canvas centre"
 * and "some layer's edge" resolves to the canvas centre, which is what users
 * expect when they drag something to the middle.
 */
function verticalTargets(ctx: SnapContext): SnapTarget[] {
    const targets: SnapTarget[] = [
        { position: 0, from: 0, to: ctx.canvasHeight, kind: 'canvas-edge' },
        { position: ctx.canvasWidth / 2, from: 0, to: ctx.canvasHeight, kind: 'canvas-center' },
        { position: ctx.canvasWidth, from: 0, to: ctx.canvasHeight, kind: 'canvas-edge' },
    ];

    for (const other of ctx.others) {
        const from = other.y;
        const to = other.y + other.height;
        targets.push({ position: other.x, from, to, kind: 'rect' });
        targets.push({ position: other.x + other.width / 2, from, to, kind: 'rect' });
        targets.push({ position: other.x + other.width, from, to, kind: 'rect' });
    }

    return targets;
}

function horizontalTargets(ctx: SnapContext): SnapTarget[] {
    const targets: SnapTarget[] = [
        { position: 0, from: 0, to: ctx.canvasWidth, kind: 'canvas-edge' },
        { position: ctx.canvasHeight / 2, from: 0, to: ctx.canvasWidth, kind: 'canvas-center' },
        { position: ctx.canvasHeight, from: 0, to: ctx.canvasWidth, kind: 'canvas-edge' },
    ];

    for (const other of ctx.others) {
        const from = other.x;
        const to = other.x + other.width;
        targets.push({ position: other.y, from, to, kind: 'rect' });
        targets.push({ position: other.y + other.height / 2, from, to, kind: 'rect' });
        targets.push({ position: other.y + other.height, from, to, kind: 'rect' });
    }

    return targets;
}

/**
 * Smallest offset that brings any of `edges` onto any target, or null when
 * nothing is within the threshold.
 */
function bestDelta(edges: number[], targets: SnapTarget[], threshold: number): number | null {
    let best: number | null = null;
    let bestDistance = Infinity;

    for (const edge of edges) {
        for (const target of targets) {
            const delta = target.position - edge;
            const distance = Math.abs(delta);
            if (distance <= threshold && distance < bestDistance) {
                bestDistance = distance;
                best = delta;
            }
        }
    }

    return best;
}

/**
 * Every target the (already snapped) edges now sit on, widened to cover both
 * the target's own span and the dragged rect, so the drawn line visibly
 * connects the two.
 */
function collectGuides(
    orientation: 'v' | 'h',
    edges: number[],
    targets: SnapTarget[],
    rectFrom: number,
    rectTo: number,
): Guide[] {
    const byPosition = new Map<number, Guide>();

    for (const edge of edges) {
        for (const target of targets) {
            if (Math.abs(target.position - edge) > ALIGN_EPSILON) {
                continue;
            }

            const existing = byPosition.get(target.position);
            const from = Math.min(target.from, rectFrom, existing?.from ?? Infinity);
            const to = Math.max(target.to, rectTo, existing?.to ?? -Infinity);

            byPosition.set(target.position, {
                orientation,
                position: target.position,
                from,
                to,
                // A canvas-centre match outranks a coincident layer edge so the
                // crosshair still shows.
                kind: existing?.kind === 'canvas-center' ? 'canvas-center' : target.kind,
            });
        }
    }

    return Array.from(byPosition.values());
}

/**
 * Snap a rect being *moved*. Both axes are considered independently, using the
 * rect's leading edge, centre and trailing edge as candidates.
 */
export function snapMove(rect: SnapRect, ctx: SnapContext): SnapResult {
    const vertical = verticalTargets(ctx);
    const horizontal = horizontalTargets(ctx);

    let { x, y } = rect;
    const { width, height } = rect;

    const dx = bestDelta([x, x + width / 2, x + width], vertical, ctx.thresholdPx);
    if (dx !== null) {
        x += dx;
    }

    const dy = bestDelta([y, y + height / 2, y + height], horizontal, ctx.thresholdPx);
    if (dy !== null) {
        y += dy;
    }

    const guides = [
        ...collectGuides('v', [x, x + width / 2, x + width], vertical, y, y + height),
        ...collectGuides('h', [y, y + height / 2, y + height], horizontal, x, x + width),
    ];

    return { x, y, width, height, guides };
}

/**
 * Snap a rect being *resized*. Only the edges the handle actually moves are
 * candidates — the anchored edges stay exactly where they are.
 */
export function snapResize(rect: SnapRect, handle: string, ctx: SnapContext): SnapResult {
    const minWidth = ctx.minWidth ?? 1;
    const minHeight = ctx.minHeight ?? 1;
    const vertical = verticalTargets(ctx);
    const horizontal = horizontalTargets(ctx);

    let { x, y, width, height } = rect;

    const movesLeft = handle.includes('left');
    const movesRight = handle.includes('right');
    const movesTop = handle.includes('top');
    const movesBottom = handle.includes('bottom');

    const xEdges: number[] = [];
    if (movesLeft) xEdges.push(x);
    if (movesRight) xEdges.push(x + width);

    const dx = bestDelta(xEdges, vertical, ctx.thresholdPx);
    if (dx !== null) {
        if (movesLeft && width - dx >= minWidth) {
            x += dx;
            width -= dx;
        } else if (movesRight && width + dx >= minWidth) {
            width += dx;
        }
    }

    const yEdges: number[] = [];
    if (movesTop) yEdges.push(y);
    if (movesBottom) yEdges.push(y + height);

    const dy = bestDelta(yEdges, horizontal, ctx.thresholdPx);
    if (dy !== null) {
        if (movesTop && height - dy >= minHeight) {
            y += dy;
            height -= dy;
        } else if (movesBottom && height + dy >= minHeight) {
            height += dy;
        }
    }

    const movedX: number[] = [];
    if (movesLeft) movedX.push(x);
    if (movesRight) movedX.push(x + width);
    const movedY: number[] = [];
    if (movesTop) movedY.push(y);
    if (movesBottom) movedY.push(y + height);

    const guides = [
        ...collectGuides('v', movedX, vertical, y, y + height),
        ...collectGuides('h', movedY, horizontal, x, x + width),
    ];

    return { x, y, width, height, guides };
}

/**
 * Guides currently drawn on the canvas. Shared module state rather than a
 * context so that any dragged element (scene layer or overlay clip) can publish
 * to the single overlay rendered by SceneEditor.
 */
let activeGuides = $state<Guide[]>([]);

export const canvasGuides = {
    get active(): Guide[] {
        return activeGuides;
    },
    get hasCenterSnap(): boolean {
        return activeGuides.some((guide) => guide.kind === 'canvas-center');
    },
    set(guides: Guide[]): void {
        activeGuides = guides;
    },
    clear(): void {
        if (activeGuides.length > 0) {
            activeGuides = [];
        }
    },
};
