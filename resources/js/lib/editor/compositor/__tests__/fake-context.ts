import type { Canvas2D } from '../context';

/**
 * A recording 2D context.
 *
 * jsdom has no canvas implementation, so the compositor is tested by asserting
 * on the CALL SEQUENCE it produces rather than on pixels. That is the right
 * level anyway: paint order, save/restore balance and transform sequences are
 * exactly the properties that used to differ between the renderers.
 */

export type RecordedCall = { kind: 'call'; name: string; args: unknown[] };
export type RecordedSet = { kind: 'set'; name: string; value: unknown };
export type Recorded = RecordedCall | RecordedSet;

const METHODS = [
    'save',
    'restore',
    'translate',
    'rotate',
    'scale',
    'beginPath',
    'closePath',
    'moveTo',
    'lineTo',
    'arcTo',
    'rect',
    'roundRect',
    'ellipse',
    'clip',
    'fill',
    'stroke',
    'fillRect',
    'strokeRect',
    'clearRect',
    'drawImage',
    'fillText',
    'strokeText',
    'putImageData',
] as const;

const PROPERTIES = [
    'fillStyle',
    'strokeStyle',
    'font',
    'textAlign',
    'textBaseline',
    'globalAlpha',
    'globalCompositeOperation',
    'lineWidth',
    'lineJoin',
    'miterLimit',
] as const;

export type FakeContext = Canvas2D & {
    readonly log: Recorded[];
    calls(name: string): RecordedCall[];
    names(): string[];
    sets(name: string): unknown[];
    reset(): void;
};

export type FakeContextOptions = {
    /** Advance width per character returned by `measureText`. */
    charWidth?: number;
    /** When false, `letterSpacing` is absent so the per-glyph path is used. */
    letterSpacing?: boolean;
};

export function createFakeContext(
    options: FakeContextOptions = {},
): FakeContext {
    const charWidth = options.charWidth ?? 10;
    const log: Recorded[] = [];

    const target: Record<string, unknown> = {
        log,
        calls: (name: string) =>
            log.filter(
                (entry): entry is RecordedCall =>
                    entry.kind === 'call' && entry.name === name,
            ),
        names: () =>
            log
                .filter((entry): entry is RecordedCall => entry.kind === 'call')
                .map((entry) => entry.name),
        sets: (name: string) =>
            log
                .filter(
                    (entry): entry is RecordedSet =>
                        entry.kind === 'set' && entry.name === name,
                )
                .map((entry) => entry.value),
        reset: () => {
            log.length = 0;
        },
        measureText: (text: string) => ({ width: text.length * charWidth }),
        createImageData: (width: number, height: number) => ({
            width,
            height,
            data: new Uint8ClampedArray(width * height * 4),
        }),
        getImageData: (
            x: number,
            y: number,
            width: number,
            height: number,
        ) => ({
            width,
            height,
            data: new Uint8ClampedArray(width * height * 4),
        }),
    };

    for (const name of METHODS) {
        target[name] = (...args: unknown[]) => {
            log.push({ kind: 'call', name, args });
        };
    }

    const values: Record<string, unknown> = {
        globalAlpha: 1,
        lineWidth: 1,
        globalCompositeOperation: 'source-over',
    };

    for (const name of PROPERTIES) {
        Object.defineProperty(target, name, {
            get: () => values[name],
            set: (value: unknown) => {
                values[name] = value;
                log.push({ kind: 'set', name, value });
            },
            enumerable: true,
            configurable: true,
        });
    }

    if (options.letterSpacing !== false) {
        values.letterSpacing = '0px';
        Object.defineProperty(target, 'letterSpacing', {
            get: () => values.letterSpacing,
            set: (value: unknown) => {
                values.letterSpacing = value;
                log.push({ kind: 'set', name: 'letterSpacing', value });
            },
            enumerable: true,
            configurable: true,
        });
    }

    return target as unknown as FakeContext;
}

/**
 * Net save/restore depth across a recorded log, and the minimum depth reached.
 *
 * A non-zero net depth means a path leaked a `save()`; a negative minimum means
 * it restored state it never saved. Both corrupt every later element, so this
 * is asserted on every painting test, including the early-return paths.
 */
export function saveBalance(log: Recorded[]): {
    net: number;
    min: number;
} {
    let depth = 0;
    let min = 0;

    for (const entry of log) {
        if (entry.kind !== 'call') {
            continue;
        }
        if (entry.name === 'save') {
            depth += 1;
        }
        if (entry.name === 'restore') {
            depth -= 1;
            min = Math.min(min, depth);
        }
    }

    return { net: depth, min };
}

/** A stand-in for a decoded image of a known intrinsic size. */
export function fakeImage(width: number, height: number): CanvasImageSource {
    return { width, height } as unknown as CanvasImageSource;
}
