import type { Scene, SceneTransition, TransitionType } from '@/types';

export const DEFAULT_TRANSITION_MS = 500;
export const MIN_TRANSITION_MS = 100;
export const MAX_TRANSITION_MS = 1500;

export type TransitionOption = {
    value: TransitionType;
    label: string;
    /** Whether the DOM preview can approximate this transition. */
    previewable: boolean;
};

/** Mirrors App\Enums\TransitionType — every value is an ffmpeg xfade name. */
export const TRANSITION_OPTIONS: TransitionOption[] = [
    { value: 'fade', label: 'Fade', previewable: true },
    { value: 'fadeblack', label: 'Fade to Black', previewable: true },
    { value: 'fadewhite', label: 'Fade to White', previewable: true },
    { value: 'dissolve', label: 'Dissolve', previewable: true },
    { value: 'slideleft', label: 'Slide Left', previewable: false },
    { value: 'slideright', label: 'Slide Right', previewable: false },
    { value: 'slideup', label: 'Slide Up', previewable: false },
    { value: 'slidedown', label: 'Slide Down', previewable: false },
    { value: 'wipeleft', label: 'Wipe Left', previewable: false },
    { value: 'wiperight', label: 'Wipe Right', previewable: false },
    { value: 'circleopen', label: 'Circle Open', previewable: false },
    { value: 'circleclose', label: 'Circle Close', previewable: false },
];

export function transitionLabel(type: TransitionType | undefined): string {
    return TRANSITION_OPTIONS.find((option) => option.value === type)?.label ?? 'None';
}

export function isPreviewableTransition(type: TransitionType | undefined): boolean {
    return TRANSITION_OPTIONS.find((option) => option.value === type)?.previewable ?? false;
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
