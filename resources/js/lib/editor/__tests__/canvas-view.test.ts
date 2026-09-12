import { describe, expect, it } from 'vitest';
import {
    computeBackingSize,
    editTargetOf,
    elementScreenBox,
    fitScale,
    frameMediaUrls,
    hitTestElements,
    interactiveElements,
    isSameTarget,
    pointInElement,
    projectPointFromClient,
    sameUrls,
} from '../canvas-view';
import type {
    CompositedFrame,
    ResolvedElement,
    ResolvedFrame,
} from '../model/frame';

function shape(overrides: Partial<ResolvedElement> = {}): ResolvedElement {
    return {
        id: 'shape-1',
        origin: 'scene',
        containerId: 'scene-1',
        zIndex: 0,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
        opacity: 1,
        localTimeMs: 0,
        kind: 'shape',
        shape: 'rectangle',
        fillColor: '#fff',
        borderColor: null,
        borderWidth: 0,
        cornerRadius: 0,
        ...overrides,
    } as ResolvedElement;
}

function media(overrides: Partial<ResolvedElement> = {}): ResolvedElement {
    return {
        ...shape(),
        kind: 'image',
        assetId: 1,
        url: 'a.png',
        fit: 'cover',
        adjustments: { brightness: 0, contrast: 1, saturation: 1 },
        sourceTimeSec: null,
        volume: 0,
        muted: true,
        ...overrides,
    } as ResolvedElement;
}

function frame(elements: ResolvedElement[]): ResolvedFrame {
    return {
        timeMs: 0,
        width: 1920,
        height: 1080,
        backgroundColor: '#000000',
        elements,
        subtitles: [],
    };
}

describe('fitScale', () => {
    it('fits the project inside the container, minus padding', () => {
        // 1920 wide in 1008px of usable width -> limited by width.
        expect(fitScale(1056, 2000, 1920, 1080)).toBeCloseTo(1008 / 1920);
    });

    it('is limited by whichever axis is tighter', () => {
        expect(fitScale(4000, 588, 1920, 1080)).toBeCloseTo(540 / 1080);
    });

    it('never upscales past 1:1', () => {
        expect(fitScale(4000, 4000, 1920, 1080)).toBe(1);
    });

    it('survives a container that has not been laid out yet', () => {
        expect(fitScale(0, 0, 1920, 1080)).toBeGreaterThan(0);
        expect(fitScale(1000, 1000, 0, 0)).toBe(1);
    });
});

describe('computeBackingSize', () => {
    it('never drops below the project resolution', () => {
        const size = computeBackingSize(1920, 1080, 0.25, 1);
        expect(size).toEqual({ width: 1920, height: 1080, renderScale: 1 });
    });

    it('supersamples when the display would out-resolve the project', () => {
        // Shown at 90% on a retina screen: 1.8 device px per project px.
        const size = computeBackingSize(1920, 1080, 0.9, 2);
        expect(size.renderScale).toBeCloseTo(1.8);
        expect(size.width).toBe(3456);
        expect(size.height).toBe(1944);
    });

    it('caps supersampling so a big project cannot allocate absurdly', () => {
        expect(computeBackingSize(3840, 2160, 1, 3).renderScale).toBe(2);
    });

    it('falls back to sane numbers for degenerate input', () => {
        expect(computeBackingSize(0, 0, 1, 2)).toEqual({
            width: 1,
            height: 1,
            renderScale: 1,
        });
        expect(
            computeBackingSize(100, 100, Number.NaN, Number.NaN).renderScale,
        ).toBe(1);
    });
});

describe('projectPointFromClient', () => {
    it('undoes the display scale and the canvas offset', () => {
        expect(
            projectPointFromClient(300, 200, { left: 100, top: 50 }, 0.5),
        ).toEqual({
            x: 400,
            y: 300,
        });
    });

    it('treats a zero scale as 1:1 rather than producing infinities', () => {
        expect(projectPointFromClient(10, 10, { left: 0, top: 0 }, 0)).toEqual({
            x: 10,
            y: 10,
        });
    });
});

describe('elementScreenBox', () => {
    it('scales the resolved geometry and carries the rotation through', () => {
        const box = elementScreenBox(
            shape({ x: 100, y: 200, width: 400, height: 300, rotation: 30 }),
            0.5,
        );

        expect(box).toEqual({
            left: 50,
            top: 100,
            width: 200,
            height: 150,
            rotation: 30,
        });
    });
});

describe('pointInElement', () => {
    it('accepts points inside an unrotated box and rejects points outside', () => {
        const element = shape({ x: 100, y: 100, width: 200, height: 100 });

        expect(pointInElement(element, 150, 150)).toBe(true);
        expect(pointInElement(element, 99, 150)).toBe(false);
        expect(pointInElement(element, 150, 201)).toBe(false);
    });

    it('rotates the box, not its bounding rectangle', () => {
        // A 200x100 box at the origin, rotated 90deg about its centre, covers
        // x 50..150, y 0..100 — so its old corner is now outside it.
        const element = shape({
            x: 0,
            y: 0,
            width: 200,
            height: 100,
            rotation: 90,
        });

        expect(pointInElement(element, 100, 10)).toBe(true);
        expect(pointInElement(element, 10, 50)).toBe(false);
        expect(pointInElement(element, 60, 90)).toBe(true);
    });

    it('rejects degenerate elements and non-finite points', () => {
        expect(pointInElement(shape({ width: 0 }), 0, 0)).toBe(false);
        expect(pointInElement(shape(), Number.NaN, 0)).toBe(false);
    });
});

describe('interactiveElements and hitTestElements', () => {
    it('orders scene layers and overlay clips by the one global zIndex', () => {
        const composited: CompositedFrame = {
            primary: frame([
                shape({
                    id: 'clip',
                    origin: 'track',
                    containerId: 'track-1',
                    zIndex: 5,
                }),
                shape({ id: 'layer', zIndex: 9 }),
            ]),
        };

        expect(
            interactiveElements(composited).map((element) => element.id),
        ).toEqual(['clip', 'layer']);
    });

    it('gives the topmost element to a click in an overlap', () => {
        const bottom = shape({ id: 'bottom', zIndex: 0 });
        const top = shape({ id: 'top', zIndex: 1, x: 50, y: 50 });

        expect(hitTestElements([bottom, top], 60, 60)?.id).toBe('top');
        expect(hitTestElements([bottom, top], 10, 10)?.id).toBe('bottom');
        expect(hitTestElements([bottom, top], 500, 500)).toBeNull();
    });

    it('does not let an overlay clip win purely for being an overlay clip', () => {
        // The old preview forced every clip above every layer with z-[100];
        // ordering now comes only from zIndex.
        const clip = shape({
            id: 'clip',
            origin: 'track',
            containerId: 'track-1',
            zIndex: 1,
        });
        const layer = shape({ id: 'layer', zIndex: 2 });

        expect(hitTestElements([clip, layer], 10, 10)?.id).toBe('layer');
    });
});

describe('editTargetOf / isSameTarget', () => {
    it('carries where an element is stored, not where it is painted', () => {
        expect(
            editTargetOf(
                shape({ id: 'clip', origin: 'track', containerId: 'track-1' }),
            ),
        ).toEqual({
            origin: 'track',
            containerId: 'track-1',
            id: 'clip',
        });
    });

    it('does not confuse a layer and a clip that share an id', () => {
        const layer = editTargetOf(shape({ id: 'x' }));
        const clip = editTargetOf(
            shape({ id: 'x', origin: 'track', containerId: 'scene-1' }),
        );

        expect(isSameTarget(layer, layer)).toBe(true);
        expect(isSameTarget(layer, clip)).toBe(false);
        expect(isSameTarget(layer, null)).toBe(false);
    });
});

describe('frameMediaUrls / sameUrls', () => {
    it('collects both sides of a transition and de-duplicates', () => {
        const composited: CompositedFrame = {
            primary: frame([
                media({ url: 'a.mp4' }),
                media({ url: 'a.mp4' }),
                shape(),
            ]),
            transition: {
                type: 'fade',
                progress: 0.5,
                incoming: frame([media({ url: 'b.mp4' })]),
            },
        };

        expect(frameMediaUrls(composited)).toEqual(['a.mp4', 'b.mp4']);
    });

    it('ignores elements with no asset url', () => {
        expect(
            frameMediaUrls({ primary: frame([media({ url: null })]) }),
        ).toEqual([]);
    });

    it('reports an unchanged set so the decode layer is not re-declared per frame', () => {
        expect(sameUrls(['a', 'b'], ['a', 'b'])).toBe(true);
        expect(sameUrls(['a', 'b'], ['b', 'a'])).toBe(false);
        expect(sameUrls(['a'], ['a', 'b'])).toBe(false);
    });
});
