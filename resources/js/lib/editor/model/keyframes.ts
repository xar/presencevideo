import { applyEasing  } from './easing';
import type {Easing} from './easing';

/**
 * A single authored value on a property track.
 *
 * `time_ms` is ELEMENT-LOCAL: measured from the moment the element starts, not
 * from the start of the project. Animation therefore travels with the element
 * when it is moved along the timeline or retimed, which is what users expect
 * when they drag a clip that already fades in.
 */
export type Keyframe = {
    time_ms: number;
    value: number;
    /** Curve applied on the way OUT of this keyframe, toward the next one. */
    easing?: Easing;
};

/**
 * Property paths that may be animated, addressed exactly as they are stored on
 * the element so a track needs no translation table to be applied.
 */
export type AnimatableProperty =
    | 'x'
    | 'y'
    | 'width'
    | 'height'
    | 'rotation'
    | 'opacity'
    | 'volume'
    | 'adjustments.brightness'
    | 'adjustments.contrast'
    | 'adjustments.saturation';

export const ANIMATABLE_PROPERTIES: readonly AnimatableProperty[] = [
    'x',
    'y',
    'width',
    'height',
    'rotation',
    'opacity',
    'volume',
    'adjustments.brightness',
    'adjustments.contrast',
    'adjustments.saturation',
] as const;

/** Keyframe tracks on an element, keyed by the property each one drives. */
export type KeyframeTracks = Partial<Record<AnimatableProperty, Keyframe[]>>;

/**
 * Order a track by time without mutating the caller's array.
 *
 * Tracks are kept sorted on write, but payloads arrive from the API, from the
 * AI agent tools and from hand-edited project JSON, so sampling tolerates
 * unsorted input rather than silently interpolating backwards.
 */
export function sortKeyframes(keyframes: readonly Keyframe[]): Keyframe[] {
    return [...keyframes].sort((a, b) => a.time_ms - b.time_ms);
}

/**
 * Sample a property track at an element-local time.
 *
 * Returns `null` when the track cannot produce a value, which is the signal to
 * fall back to the element's static property. Outside the authored range the
 * track holds its first/last value: a clip whose fade-in ends at 500ms stays
 * fully opaque for the rest of its life without needing a closing keyframe.
 */
export function sampleKeyframes(
    keyframes: readonly Keyframe[] | undefined,
    localTimeMs: number,
): number | null {
    if (!keyframes || keyframes.length === 0) {
        return null;
    }

    const sorted = sortKeyframes(keyframes);

    if (sorted.length === 1) {
        return sorted[0].value;
    }

    const first = sorted[0];
    if (localTimeMs <= first.time_ms) {
        return first.value;
    }

    const last = sorted[sorted.length - 1];
    if (localTimeMs >= last.time_ms) {
        return last.value;
    }

    // Walk to the LAST keyframe at or before the sample time. Taking the last
    // one matters when keyframes are stacked on the same millisecond: the pair
    // then reads as an instant cut, with the later value winning from that
    // millisecond onward instead of the earlier segment swallowing it.
    let index = 0;
    for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].time_ms <= localTimeMs) {
            index = i;
        } else {
            break;
        }
    }

    const from = sorted[index];
    if (from.time_ms === localTimeMs) {
        return from.value;
    }

    const to = sorted[index + 1];
    if (!to) {
        return from.value;
    }

    const span = to.time_ms - from.time_ms;
    if (span <= 0) {
        return to.value;
    }

    const progress = (localTimeMs - from.time_ms) / span;
    return (
        from.value +
        (to.value - from.value) * applyEasing(progress, from.easing)
    );
}

/** Read a dotted property path off an element-shaped object. */
export function readProperty(
    source: unknown,
    path: string,
): number | undefined {
    const value = path.split('.').reduce<unknown>((current, segment) => {
        if (current === null || typeof current !== 'object') {
            return undefined;
        }
        return (current as Record<string, unknown>)[segment];
    }, source);

    return typeof value === 'number' ? value : undefined;
}

/** Write a dotted property path onto a target, creating intermediate objects. */
export function writeProperty(
    target: Record<string, unknown>,
    path: string,
    value: number,
): void {
    const segments = path.split('.');
    let cursor: Record<string, unknown> = target;

    for (let i = 0; i < segments.length - 1; i++) {
        const segment = segments[i];
        const next = cursor[segment];
        // Clone rather than mutate in place: the source object is store state and
        // resolving a frame must never write back into it.
        const container: Record<string, unknown> =
            next !== null && typeof next === 'object'
                ? { ...(next as Record<string, unknown>) }
                : {};
        cursor[segment] = container;
        cursor = container;
    }

    cursor[segments[segments.length - 1]] = value;
}

/**
 * Apply every track on an element at an element-local time, returning a new
 * object with the animated properties overlaid on the static ones.
 *
 * The element is returned untouched when it has no tracks, so an un-animated
 * project resolves with no allocation and renders exactly as it did before
 * keyframes existed.
 */
export function applyKeyframes<T extends object>(
    element: T,
    tracks: KeyframeTracks | undefined,
    localTimeMs: number,
): T {
    if (!tracks) {
        return element;
    }

    const entries = Object.entries(tracks) as Array<
        [AnimatableProperty, Keyframe[] | undefined]
    >;
    if (entries.length === 0) {
        return element;
    }

    let resolved: Record<string, unknown> | null = null;

    for (const [property, keyframes] of entries) {
        const sampled = sampleKeyframes(keyframes, localTimeMs);
        if (sampled === null) {
            continue;
        }

        resolved ??= { ...(element as Record<string, unknown>) };
        writeProperty(resolved, property, sampled);
    }

    return (resolved ?? element) as T;
}
