import type { Easing } from './easing';
import type { Keyframe, KeyframeTracks } from './keyframes';

/**
 * Canned animations expressed as ordinary keyframe tracks.
 *
 * A preset is only a generator: once applied, the result is indistinguishable
 * from keyframes the user placed by hand, so it stays editable and needs no
 * separate code path in the compositor or the renderer.
 */
export type MotionPresetId =
    | 'fade-in'
    | 'fade-out'
    | 'fade-in-out'
    | 'ken-burns-in'
    | 'ken-burns-out'
    | 'slide-in-left'
    | 'slide-in-right'
    | 'slide-in-up'
    | 'slide-in-down'
    | 'pop-in'
    | 'drift-up';

/** Geometry a preset needs to express motion in the element's own terms. */
export type MotionContext = {
    /** How long the element is on screen, in ms. */
    durationMs: number;
    x: number;
    y: number;
    width: number;
    height: number;
    /** Project canvas size, used by presets that travel in from off-canvas. */
    canvasWidth: number;
    canvasHeight: number;
};

export type MotionPreset = {
    id: MotionPresetId;
    label: string;
    /** Grouping for the inspector menu. */
    group: 'Opacity' | 'Scale' | 'Position';
    build: (context: MotionContext) => KeyframeTracks;
};

/** Default on/off ramp. Short enough to read as polish, not as a transition. */
const RAMP_MS = 500;

/**
 * Clamp a ramp so it never exceeds a share of the element's life. A 300ms clip
 * with a 500ms fade would otherwise never reach full opacity.
 */
function ramp(
    durationMs: number,
    preferredMs: number = RAMP_MS,
    share = 0.4,
): number {
    return Math.max(1, Math.min(preferredMs, Math.floor(durationMs * share)));
}

function track(...keyframes: Keyframe[]): Keyframe[] {
    return keyframes;
}

function fadeIn(durationMs: number, easing: Easing = 'ease-out'): Keyframe[] {
    const length = ramp(durationMs);
    return track(
        { time_ms: 0, value: 0, easing },
        { time_ms: length, value: 1 },
    );
}

function fadeOut(durationMs: number, easing: Easing = 'ease-in'): Keyframe[] {
    const length = ramp(durationMs);
    return track(
        { time_ms: Math.max(0, durationMs - length), value: 1, easing },
        { time_ms: durationMs, value: 0 },
    );
}

/**
 * A slow scale about the element's centre.
 *
 * Width/height are animated together with x/y so the element grows around its
 * middle; the compositor positions by top-left, so a centred zoom has to move
 * the origin by half the size change itself.
 */
function scaleAboutCentre(
    context: MotionContext,
    fromScale: number,
    toScale: number,
    easing: Easing,
): KeyframeTracks {
    const { durationMs, x, y, width, height } = context;

    const at = (scale: number) => ({
        width: width * scale,
        height: height * scale,
        x: x + (width - width * scale) / 2,
        y: y + (height - height * scale) / 2,
    });

    const start = at(fromScale);
    const end = at(toScale);

    return {
        x: track(
            { time_ms: 0, value: start.x, easing },
            { time_ms: durationMs, value: end.x },
        ),
        y: track(
            { time_ms: 0, value: start.y, easing },
            { time_ms: durationMs, value: end.y },
        ),
        width: track(
            { time_ms: 0, value: start.width, easing },
            { time_ms: durationMs, value: end.width },
        ),
        height: track(
            { time_ms: 0, value: start.height, easing },
            { time_ms: durationMs, value: end.height },
        ),
    };
}

function slideIn(
    context: MotionContext,
    direction: 'left' | 'right' | 'up' | 'down',
): KeyframeTracks {
    const { durationMs, x, y, width, height, canvasWidth, canvasHeight } =
        context;
    const length = ramp(durationMs, 600);
    const easing: Easing = 'ease-out';

    if (direction === 'left' || direction === 'right') {
        const from = direction === 'left' ? -width : canvasWidth;
        return {
            x: track(
                { time_ms: 0, value: from, easing },
                { time_ms: length, value: x },
            ),
        };
    }

    const from = direction === 'up' ? -height : canvasHeight;
    return {
        y: track(
            { time_ms: 0, value: from, easing },
            { time_ms: length, value: y },
        ),
    };
}

export const MOTION_PRESETS: readonly MotionPreset[] = [
    {
        id: 'fade-in',
        label: 'Fade in',
        group: 'Opacity',
        build: ({ durationMs }) => ({ opacity: fadeIn(durationMs) }),
    },
    {
        id: 'fade-out',
        label: 'Fade out',
        group: 'Opacity',
        build: ({ durationMs }) => ({ opacity: fadeOut(durationMs) }),
    },
    {
        id: 'fade-in-out',
        label: 'Fade in and out',
        group: 'Opacity',
        build: ({ durationMs }) => {
            const length = ramp(durationMs, RAMP_MS, 0.25);
            return {
                opacity: track(
                    { time_ms: 0, value: 0, easing: 'ease-out' },
                    { time_ms: length, value: 1, easing: 'linear' },
                    {
                        time_ms: Math.max(length, durationMs - length),
                        value: 1,
                        easing: 'ease-in',
                    },
                    { time_ms: durationMs, value: 0 },
                ),
            };
        },
    },
    {
        id: 'ken-burns-in',
        label: 'Ken Burns (zoom in)',
        group: 'Scale',
        build: (context) => scaleAboutCentre(context, 1, 1.15, 'ease-in-out'),
    },
    {
        id: 'ken-burns-out',
        label: 'Ken Burns (zoom out)',
        group: 'Scale',
        build: (context) => scaleAboutCentre(context, 1.15, 1, 'ease-in-out'),
    },
    {
        id: 'pop-in',
        label: 'Pop in',
        group: 'Scale',
        build: (context) => {
            const length = ramp(context.durationMs, 350);
            const popped = scaleAboutCentre(
                { ...context, durationMs: length },
                0.8,
                1,
                [0.34, 1.56, 0.64, 1],
            );
            return {
                ...popped,
                opacity: fadeIn(context.durationMs, 'ease-out'),
            };
        },
    },
    {
        id: 'slide-in-left',
        label: 'Slide in from left',
        group: 'Position',
        build: (context) => slideIn(context, 'left'),
    },
    {
        id: 'slide-in-right',
        label: 'Slide in from right',
        group: 'Position',
        build: (context) => slideIn(context, 'right'),
    },
    {
        id: 'slide-in-up',
        label: 'Slide in from top',
        group: 'Position',
        build: (context) => slideIn(context, 'up'),
    },
    {
        id: 'slide-in-down',
        label: 'Slide in from bottom',
        group: 'Position',
        build: (context) => slideIn(context, 'down'),
    },
    {
        id: 'drift-up',
        label: 'Drift up',
        group: 'Position',
        build: ({ durationMs, y, height }) => ({
            y: track(
                { time_ms: 0, value: y + height * 0.04, easing: 'linear' },
                { time_ms: durationMs, value: y - height * 0.04 },
            ),
        }),
    },
] as const;

export function findMotionPreset(id: MotionPresetId): MotionPreset | undefined {
    return MOTION_PRESETS.find((preset) => preset.id === id);
}

/**
 * Merge a preset's tracks onto existing ones.
 *
 * Presets replace whole property tracks rather than blending into them, so
 * applying "fade in" twice is idempotent and applying "slide in" after it keeps
 * the fade. Tracks the preset does not mention are left exactly as they were.
 */
export function applyMotionPreset(
    existing: KeyframeTracks | undefined,
    id: MotionPresetId,
    context: MotionContext,
): KeyframeTracks {
    const preset = findMotionPreset(id);
    if (!preset) {
        return existing ?? {};
    }

    return { ...(existing ?? {}), ...preset.build(context) };
}
