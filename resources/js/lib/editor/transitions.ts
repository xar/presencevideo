import type { Scene, SceneTransition, TransitionType } from '@/types';

export const DEFAULT_TRANSITION_MS = 500;
export const MIN_TRANSITION_MS = 100;
export const MAX_TRANSITION_MS = 1500;

export type TransitionOption = {
    value: TransitionType;
    label: string;
};

/** Mirrors App\Enums\TransitionType — every value is an ffmpeg xfade name. */
export const TRANSITION_OPTIONS: TransitionOption[] = [
    { value: 'fade', label: 'Fade' },
    { value: 'fadeblack', label: 'Fade to Black' },
    { value: 'fadewhite', label: 'Fade to White' },
    { value: 'dissolve', label: 'Dissolve' },
    { value: 'slideleft', label: 'Slide Left' },
    { value: 'slideright', label: 'Slide Right' },
    { value: 'slideup', label: 'Slide Up' },
    { value: 'slidedown', label: 'Slide Down' },
    { value: 'wipeleft', label: 'Wipe Left' },
    { value: 'wiperight', label: 'Wipe Right' },
    { value: 'circleopen', label: 'Circle Open' },
    { value: 'circleclose', label: 'Circle Close' },
];

export function transitionLabel(type: TransitionType | undefined): string {
    return TRANSITION_OPTIONS.find((option) => option.value === type)?.label ?? 'None';
}

/**
 * Clamp a transition duration the same way the renderer does: at most 1.5s and
 * at most half of either adjacent scene's duration.
 */
export function clampTransitionMs(
    durationMs: number,
    scene: Scene | undefined,
    nextScene: Scene | undefined,
): number {
    const max = Math.min(
        MAX_TRANSITION_MS,
        Math.floor((scene?.duration_ms ?? MAX_TRANSITION_MS * 2) / 2),
        Math.floor((nextScene?.duration_ms ?? MAX_TRANSITION_MS * 2) / 2),
    );

    return Math.max(1, Math.min(Math.round(durationMs), max));
}

/** The transition that actually renders for a scene (ignored on the last scene). */
export function effectiveTransition(
    scene: Scene | undefined,
    nextScene: Scene | undefined,
): SceneTransition | null {
    if (!scene?.transition || !nextScene) return null;

    return {
        type: scene.transition.type,
        duration_ms: clampTransitionMs(scene.transition.duration_ms, scene, nextScene),
    };
}
