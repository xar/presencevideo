import type { LocalExportProgress } from './local-export';

/**
 * Which of the two export pipelines a user gets.
 *
 * There are two, and they are not equivalent. The BROWSER path runs the same
 * `resolveFrame` + `drawFrame` pipeline as the live preview, so what it writes
 * is what the user saw — keyframes, text layout, transitions, colour and the
 * mixed audio all included. The SERVER path is the legacy FFmpeg renderer: it
 * has no keyframe support at all, so animated elements are simply missing from
 * its output. It stays available because it produces a durable URL and does
 * not occupy the user's machine, but it is a fallback, not the default.
 *
 * The decision is a pure function so the rule can be tested headless rather
 * than inferred from a component's markup.
 */

export type ExportPath = 'browser' | 'server';

export type LocalExportSupport = {
    supported: boolean;
    reason: string | null;
};

export type ExportPathChoice = {
    /** The path taken unless the user deliberately picks the other one. */
    defaultPath: ExportPath;
    browserAvailable: boolean;
    /**
     * A sentence explaining why the browser path is unavailable, or null when
     * it is available. Shown instead of silently offering only the fallback.
     */
    browserUnavailableReason: string | null;
    /** Whether the user has a choice to make at all. */
    canChoose: boolean;
};

const FEATURE_DISABLED_REASON =
    'Browser export is turned off in this editor, so the server render is used instead.';

/**
 * Decide the default export path.
 *
 * The browser path wins whenever it is actually usable: the feature flag is on
 * AND this browser reports the capabilities `localExportSupport` requires.
 * Otherwise the server render is the only path, and the caller is handed the
 * reason to show.
 */
export function decideExportPath(input: {
    featureEnabled: boolean;
    support: LocalExportSupport;
}): ExportPathChoice {
    if (!input.featureEnabled) {
        return {
            defaultPath: 'server',
            browserAvailable: false,
            browserUnavailableReason: FEATURE_DISABLED_REASON,
            canChoose: false,
        };
    }

    if (!input.support.supported) {
        return {
            defaultPath: 'server',
            browserAvailable: false,
            browserUnavailableReason:
                input.support.reason ??
                'This browser cannot export video locally, so the server render is used instead.',
            canChoose: false,
        };
    }

    return {
        defaultPath: 'browser',
        browserAvailable: true,
        browserUnavailableReason: null,
        canChoose: true,
    };
}

/**
 * Human label for a browser-export progress tick.
 *
 * The phase matters to the user: `audio` runs the whole offline mix before a
 * single frame is drawn, so a progress bar that sits near zero for a while is
 * expected rather than stuck, and saying so avoids the "is it hung?" question.
 */
export function browserExportPhaseLabel(
    progress: LocalExportProgress | null,
): string {
    if (!progress) {
        return 'Preparing export...';
    }

    switch (progress.phase) {
        case 'audio':
            return 'Mixing audio...';
        case 'finalizing':
            return 'Finalizing MP4...';
        case 'video':
            return progress.totalFrames > 0
                ? `Rendering frame ${progress.frameIndex} of ${progress.totalFrames}`
                : 'Rendering frames...';
    }
}

/** Clamped, integral percentage for the progress bar. */
export function browserExportPercent(
    progress: LocalExportProgress | null,
): number {
    if (!progress) {
        return 0;
    }

    return Math.max(0, Math.min(100, Math.round(progress.percent)));
}
