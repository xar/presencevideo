import type {
    ResolvedFrame,
    ResolvedMediaElement,
    ResolvedShapeElement,
    ResolvedSubtitle,
    ResolvedTextElement,
} from '../../model/frame';
import type { MediaLookup } from '../draw-frame';

const base = {
    origin: 'scene' as const,
    containerId: 'scene-1',
    zIndex: 0,
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    rotation: 0,
    opacity: 1,
    localTimeMs: 0,
};

export function mediaElement(
    overrides: Partial<ResolvedMediaElement> = {},
): ResolvedMediaElement {
    return {
        ...base,
        id: 'media-1',
        kind: 'image',
        assetId: 1,
        url: 'https://example.test/a.png',
        fit: 'cover',
        adjustments: { brightness: 0, contrast: 1, saturation: 1 },
        sourceTimeSec: null,
        volume: 1,
        muted: false,
        ...overrides,
    };
}

export function textElement(
    overrides: Partial<ResolvedTextElement> = {},
): ResolvedTextElement {
    return {
        ...base,
        id: 'text-1',
        kind: 'text',
        text: 'hello',
        fontFamily: 'Inter',
        fontSize: 20,
        fontWeight: 'normal',
        color: '#ffffff',
        align: 'left',
        verticalAlign: 'top',
        padding: 0,
        lineHeight: 1.2,
        letterSpacing: 0,
        backgroundColor: null,
        backgroundRadius: 0,
        strokeColor: null,
        strokeWidth: 0,
        ...overrides,
    };
}

export function shapeElement(
    overrides: Partial<ResolvedShapeElement> = {},
): ResolvedShapeElement {
    return {
        ...base,
        id: 'shape-1',
        kind: 'shape',
        shape: 'rectangle',
        fillColor: '#ff0000',
        borderColor: null,
        borderWidth: 0,
        cornerRadius: 0,
        ...overrides,
    };
}

export function subtitle(
    overrides: Partial<ResolvedSubtitle> = {},
): ResolvedSubtitle {
    return {
        id: 'sub-1',
        text: 'one two',
        words: [
            { text: 'one', active: true, current: false },
            { text: 'two', active: false, current: false },
        ],
        fontFamily: 'Inter',
        fontSize: 40,
        color: '#ffffff',
        highlightColor: '#ffff00',
        backgroundColor: null,
        strokeColor: null,
        strokeWidth: 0,
        position: 'bottom',
        marginV: 60,
        marginH: 40,
        uppercase: false,
        ...overrides,
    };
}

export function frame(overrides: Partial<ResolvedFrame> = {}): ResolvedFrame {
    return {
        timeMs: 0,
        width: 1920,
        height: 1080,
        backgroundColor: '#000000',
        elements: [],
        subtitles: [],
        ...overrides,
    };
}

/** A lookup that always misses — the transient state the painter must survive. */
export const emptyMedia: MediaLookup = {
    getImage: () => null,
    getVideoFrame: () => null,
};

/** A lookup that always returns an image of the given intrinsic size. */
export function mediaWith(
    width: number,
    height: number,
): MediaLookup & {
    imageCalls: string[];
    videoCalls: [string, number | null][];
} {
    const source = { width, height } as unknown as CanvasImageSource;
    const imageCalls: string[] = [];
    const videoCalls: [string, number | null][] = [];

    return {
        imageCalls,
        videoCalls,
        getImage: (url: string) => {
            imageCalls.push(url);

            return source;
        },
        getVideoFrame: (url: string, timeSec: number | null) => {
            videoCalls.push([url, timeSec]);

            return source;
        },
    };
}
