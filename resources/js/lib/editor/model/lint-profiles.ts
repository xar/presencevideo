/**
 * Platform profiles for `lintProject()`.
 *
 * Everything is expressed as a FRACTION of the canvas so one profile serves any
 * resolution: the TikTok right rail is the right 14% of the frame whether the
 * project is 1080x1920 or 540x960.
 */
export type LintProfileId = 'tiktok' | 'reels' | 'shorts' | 'generic';

/** A rectangle in canvas fractions, 0..1 on both axes. */
export type SafeZone = {
    id: string;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
};

export type LintProfile = {
    id: LintProfileId;
    label: string;
    /** Regions the platform UI covers; text and logos must stay out. */
    safeZones: SafeZone[];
    /** Font size / canvas height; below `warn` warns, below `error` errors. */
    minTextFraction: { warn: number; error: number };
    /** Any single scene longer than this reads as slow. Null disables. */
    maxSceneMs: number | null;
    /** Average scene length above this reads as slow. Null disables. */
    targetAvgSceneMs: number | null;
    /** Total duration caps; null disables. */
    maxDurationMs: { warn: number; error: number } | null;
    minDurationMs: number | null;
    /** Something must be on screen this early, or the hook is missing. */
    hookWindowMs: number | null;
    /** Minimum logo width as a fraction of canvas width. */
    minLogoFraction: number;
};

const VERTICAL_SAFE_ZONES: SafeZone[] = [
    {
        id: 'right-rail',
        label: 'right action rail',
        x: 0.86,
        y: 0.35,
        width: 0.14,
        height: 0.5,
    },
    {
        id: 'bottom-band',
        label: 'bottom caption and username band',
        x: 0,
        y: 0.82,
        width: 1,
        height: 0.18,
    },
    {
        id: 'top-band',
        label: 'top status band',
        x: 0,
        y: 0,
        width: 1,
        height: 0.08,
    },
];

const VERTICAL_SHORT_FORM: Omit<LintProfile, 'id' | 'label'> = {
    safeZones: VERTICAL_SAFE_ZONES,
    minTextFraction: { warn: 0.03, error: 0.02 },
    maxSceneMs: 8000,
    targetAvgSceneMs: 4000,
    maxDurationMs: { warn: 60_000, error: 180_000 },
    minDurationMs: 5000,
    hookWindowMs: 1000,
    minLogoFraction: 0.06,
};

export const LINT_PROFILES: Record<LintProfileId, LintProfile> = {
    tiktok: { id: 'tiktok', label: 'TikTok', ...VERTICAL_SHORT_FORM },
    reels: { id: 'reels', label: 'Instagram Reels', ...VERTICAL_SHORT_FORM },
    shorts: { id: 'shorts', label: 'YouTube Shorts', ...VERTICAL_SHORT_FORM },
    generic: {
        id: 'generic',
        label: 'Generic',
        safeZones: [],
        minTextFraction: { warn: 0.02, error: 0.012 },
        maxSceneMs: null,
        targetAvgSceneMs: null,
        maxDurationMs: null,
        minDurationMs: null,
        hookWindowMs: null,
        minLogoFraction: 0.04,
    },
};

export const DEFAULT_LINT_PROFILE: LintProfileId = 'tiktok';

export function getLintProfile(id: LintProfileId | undefined): LintProfile {
    return LINT_PROFILES[id ?? DEFAULT_LINT_PROFILE] ?? LINT_PROFILES.tiktok;
}
