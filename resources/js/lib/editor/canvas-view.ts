import type {
    CompositedFrame,
    ResolvedElement,
    ResolvedFrame,
} from './model/frame';

/**
 * The maths behind the canvas preview.
 *
 * The preview paints through the shared compositor, so the only things the
 * component still has to decide are geometric: how big the canvas is, where a
 * click landed in project coordinates, which element that click hit, and which
 * media the current frame needs decoded. All of that is pure and lives here, so
 * the Svelte file holds wiring only and these rules can be asserted headless.
 *
 * Every coordinate below is either PROJECT pixels (the canvas' own space, the
 * same space `resolveFrame` produces) or SCREEN/CSS pixels; the function names
 * say which, and nothing mixes the two implicitly.
 */

/** Padding, in screen px, kept between the canvas and its container. */
export const CANVAS_PADDING_PX = 48;

/**
 * Display scale that fits the project resolution inside its container.
 *
 * Never upscales past 1:1 — a 1920×1080 project in a larger pane stays at its
 * native size rather than being blown up and softened.
 */
export function fitScale(
    containerWidth: number,
    containerHeight: number,
    projectWidth: number,
    projectHeight: number,
    padding = CANVAS_PADDING_PX,
): number {
    if (
        !isPositive(projectWidth) ||
        !isPositive(projectHeight) ||
        !Number.isFinite(containerWidth) ||
        !Number.isFinite(containerHeight)
    ) {
        return 1;
    }

    const availableWidth = containerWidth - padding;
    const availableHeight = containerHeight - padding;

    if (availableWidth <= 0 || availableHeight <= 0) {
        return MIN_SCALE;
    }

    const scale = Math.min(
        availableWidth / projectWidth,
        availableHeight / projectHeight,
        1,
    );

    return Math.max(MIN_SCALE, scale);
}

/** Below this the canvas is not worth painting; also guards division by zero. */
const MIN_SCALE = 0.001;

/** Hard cap on supersampling, so a retina 4K project cannot allocate absurdly. */
const MAX_RENDER_SCALE = 2;

export type BackingSize = {
    /** Backing-store width, in device pixels. */
    width: number;
    height: number;
    /**
     * Device pixels per PROJECT pixel. The painter works in project
     * coordinates, so this is applied once as a context transform rather than
     * being baked into any resolved geometry.
     */
    renderScale: number;
};

/**
 * Backing-store size for a canvas displayed at `displayScale` on a screen with
 * `devicePixelRatio` device pixels per CSS pixel.
 *
 * The backing store is never smaller than the project resolution: the exported
 * file is that size, and previewing below it would show softer text than the
 * render produces. It grows past it only when the display would otherwise
 * out-resolve it — a canvas shown near 1:1 on a retina screen — which is the
 * case the old DOM preview got for free and a naive `canvas.width = 1920` would
 * lose.
 */
export function computeBackingSize(
    projectWidth: number,
    projectHeight: number,
    displayScale: number,
    devicePixelRatio: number,
    maxRenderScale = MAX_RENDER_SCALE,
): BackingSize {
    if (!isPositive(projectWidth) || !isPositive(projectHeight)) {
        return { width: 1, height: 1, renderScale: 1 };
    }

    const dpr =
        Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
            ? devicePixelRatio
            : 1;
    const scale =
        Number.isFinite(displayScale) && displayScale > 0 ? displayScale : 1;

    const renderScale = Math.min(Math.max(scale * dpr, 1), maxRenderScale);

    return {
        width: Math.max(1, Math.round(projectWidth * renderScale)),
        height: Math.max(1, Math.round(projectHeight * renderScale)),
        renderScale,
    };
}

export type Point = { x: number; y: number };

/** Bounding box of the canvas on screen, as `getBoundingClientRect` gives it. */
export type ScreenRect = { left: number; top: number };

/** Map a client (viewport) point into project pixels. */
export function projectPointFromClient(
    clientX: number,
    clientY: number,
    rect: ScreenRect,
    displayScale: number,
): Point {
    const scale =
        Number.isFinite(displayScale) && displayScale > 0 ? displayScale : 1;

    return {
        x: (clientX - rect.left) / scale,
        y: (clientY - rect.top) / scale,
    };
}

export type ScreenBox = {
    left: number;
    top: number;
    width: number;
    height: number;
    /** Degrees, clockwise about the box centre — the same convention as the painter. */
    rotation: number;
};

/**
 * Where a resolved element sits on screen, for positioning its interaction
 * overlay.
 *
 * Taking the RESOLVED element (not the stored layer) is the point: keyframed
 * motion, trims and transitions have already been applied, so the hit target
 * and the selection ring land exactly on the pixels the canvas just painted.
 */
export function elementScreenBox(
    element: ResolvedElement,
    displayScale: number,
): ScreenBox {
    const scale =
        Number.isFinite(displayScale) && displayScale > 0 ? displayScale : 1;

    return {
        left: element.x * scale,
        top: element.y * scale,
        width: element.width * scale,
        height: element.height * scale,
        rotation: Number.isFinite(element.rotation) ? element.rotation : 0,
    };
}

/**
 * Is a project-space point inside this element?
 *
 * Rotation is about the element's own centre, so the test un-rotates the point
 * rather than growing the box: a rotated element is grabbable exactly where it
 * is painted, not across its axis-aligned bounds.
 */
export function pointInElement(
    element: ResolvedElement,
    x: number,
    y: number,
): boolean {
    if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !isPositive(element.width) ||
        !isPositive(element.height)
    ) {
        return false;
    }

    const centreX = element.x + element.width / 2;
    const centreY = element.y + element.height / 2;
    const rotation = Number.isFinite(element.rotation) ? element.rotation : 0;

    let dx = x - centreX;
    let dy = y - centreY;

    if (rotation !== 0) {
        const radians = (-rotation * Math.PI) / 180;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        const rotatedX = dx * cos - dy * sin;
        const rotatedY = dx * sin + dy * cos;
        dx = rotatedX;
        dy = rotatedY;
    }

    return (
        Math.abs(dx) <= element.width / 2 && Math.abs(dy) <= element.height / 2
    );
}

/**
 * Everything the user can grab on the canvas right now, in paint order
 * (bottom first).
 *
 * Scene layers and overlay clips come back in ONE list ordered by the global
 * `zIndex`, which is what replaced the preview's old `z-[100]` rule that forced
 * every overlay clip above every scene layer regardless of what the render did.
 */
export function interactiveElements(frame: CompositedFrame): ResolvedElement[] {
    return sortByZIndex(frame.primary);
}

/**
 * The element at a project-space point, or null.
 *
 * Topmost wins: the list is in paint order, so the search runs backwards and
 * the first hit is the element whose pixels the user actually clicked on.
 */
export function hitTestElements(
    elements: readonly ResolvedElement[],
    x: number,
    y: number,
): ResolvedElement | null {
    for (let index = elements.length - 1; index >= 0; index--) {
        if (pointInElement(elements[index], x, y)) {
            return elements[index];
        }
    }

    return null;
}

/** Identity of the stored layer or clip an element was resolved from. */
export type EditTarget = {
    origin: ResolvedElement['origin'];
    /** Scene id for scene layers, video track id for overlay clips. */
    containerId: string;
    id: string;
};

export function editTargetOf(element: ResolvedElement): EditTarget {
    return {
        origin: element.origin,
        containerId: element.containerId,
        id: element.id,
    };
}

export function isSameTarget(
    a: EditTarget | null,
    b: EditTarget | null,
): boolean {
    if (!a || !b) {
        return false;
    }

    return (
        a.origin === b.origin &&
        a.containerId === b.containerId &&
        a.id === b.id
    );
}

/**
 * Every media URL the current frame needs decoded, both sides of a transition
 * included.
 *
 * The decode layer is told about this set so it can hold a provider open for
 * what is on screen and release the rest; the caller compares successive sets
 * with `sameUrls` so a provider is not re-declared sixty times a second.
 */
export function frameMediaUrls(frame: CompositedFrame): string[] {
    const urls: string[] = [];

    collectMediaUrls(frame.primary, urls);

    if (frame.transition) {
        collectMediaUrls(frame.transition.incoming, urls);
    }

    return urls;
}

/** Set equality for the URL lists produced by `frameMediaUrls`. */
export function sameUrls(a: readonly string[], b: readonly string[]): boolean {
    if (a.length !== b.length) {
        return false;
    }

    for (let index = 0; index < a.length; index++) {
        if (a[index] !== b[index]) {
            return false;
        }
    }

    return true;
}

function collectMediaUrls(frame: ResolvedFrame, into: string[]): void {
    for (const element of frame.elements) {
        if (element.kind !== 'video' && element.kind !== 'image') {
            continue;
        }

        if (element.url && !into.includes(element.url)) {
            into.push(element.url);
        }
    }
}

function sortByZIndex(frame: ResolvedFrame): ResolvedElement[] {
    return frame.elements
        .map((element, index) => ({ element, index }))
        .sort(
            (a, b) => a.element.zIndex - b.element.zIndex || a.index - b.index,
        )
        .map((entry) => entry.element);
}

function isPositive(value: number): boolean {
    return Number.isFinite(value) && value > 0;
}
