import type {
    AudioClip,
    BrandKit,
    Project,
    ShapeLayer,
    TextLayer,
} from '@/types/editor';
import { normalizeProject } from '../normalize';
import { isBrandToken, resolveBrandColor } from './brand';
import { applyKeyframes } from './keyframes';
import {
    DEFAULT_LINT_PROFILE,
    getLintProfile
    
    
    
} from './lint-profiles';
import type {LintProfile, LintProfileId, SafeZone} from './lint-profiles';
import { buildTimeline   } from './timeline';
import type {Timeline, TimelineEntry} from './timeline';

/**
 * Production-readiness lint.
 *
 * A pure function over the project: no store, no DOM, no I/O. The editor's
 * readiness panel and the agents' `lint_video_project` tool both call this,
 * which is the point — "good enough to post" is defined once, and the agent
 * fixing an issue and the user seeing it in the panel are looking at the same
 * rule.
 *
 * Geometry is judged at each element's own start (keyframes sampled at local
 * time 0). Tokens are resolved through `brand.ts` before any colour maths.
 */

export type LintSeverity = 'error' | 'warning' | 'info';

export type LintRule =
    | 'safe-zone'
    | 'text-too-small'
    | 'out-of-canvas'
    | 'low-contrast'
    | 'hook-missing'
    | 'scene-too-long'
    | 'pacing-slow'
    | 'duration-over'
    | 'duration-short'
    | 'captions-missing'
    | 'audio-gap'
    | 'empty-scene'
    | 'missing-asset'
    | 'brand-off-palette'
    | 'brand-font'
    | 'brand-logo-missing'
    | 'brand-logo-small'
    | 'brand-outro-missing'
    | 'brand-watermark-missing';

export type LintIssue = {
    /** Stable across runs: `${rule}:${elementId ?? sceneId ?? trackId ?? 'project'}`. */
    id: string;
    rule: LintRule;
    severity: LintSeverity;
    message: string;
    /** One-line suggested fix. */
    fix?: string;
    elementId?: string;
    sceneId?: string;
    trackId?: string;
    /** Where on the timeline to look, when the issue has a place. */
    timeMs?: number;
};

export type LintSummary = { errors: number; warnings: number; infos: number };

export type LintReport = {
    profile: LintProfileId;
    /** 0..100; 100 means nothing to fix. */
    score: number;
    issues: LintIssue[];
    summary: LintSummary;
};

export type LintOptions = {
    /** Defaults to 'tiktok'. */
    profile?: LintProfileId;
};

const SAFE_ZONE_OVERLAP_SHARE = 0.1;
const OUT_OF_CANVAS_SHARE = 0.02;
const MIN_CONTRAST_RATIO = 3;
const AUDIO_GAP_MS = 1500;

const SCORE_WEIGHTS: Record<LintSeverity, number> = {
    error: 20,
    warning: 7,
    info: 2,
};

export function lintProject(
    project: Project,
    options: LintOptions = {},
): LintReport {
    const profile = getLintProfile(options.profile);
    // Lint never mutates its input: normalisation runs on a plain copy, which
    // also strips any `$state` proxy the editor might hand us.
    const normalized = normalizeProject(
        JSON.parse(JSON.stringify(project)) as Project,
    );
    const timeline = buildTimeline(normalized);
    const kit = normalized.brand_kit ?? null;

    const issues: LintIssue[] = [];
    const context: LintContext = {
        project: normalized,
        timeline,
        profile,
        kit,
        issues,
    };

    lintElements(context);
    lintHook(context);
    lintPacing(context);
    lintDuration(context);
    lintAudio(context);
    lintScenes(context);
    lintBrand(context);

    return buildReport(profile.id, issues);
}

export function scoreIssues(issues: readonly LintIssue[]): number {
    const penalty = issues.reduce(
        (total, issue) => total + SCORE_WEIGHTS[issue.severity],
        0,
    );

    return Math.max(0, Math.min(100, 100 - penalty));
}

type LintContext = {
    project: Project;
    timeline: Timeline;
    profile: LintProfile;
    kit: BrandKit | null;
    issues: LintIssue[];
};

type Box = { x: number; y: number; width: number; height: number };

function buildReport(profile: LintProfileId, issues: LintIssue[]): LintReport {
    const summary: LintSummary = { errors: 0, warnings: 0, infos: 0 };
    for (const issue of issues) {
        if (issue.severity === 'error') summary.errors += 1;
        else if (issue.severity === 'warning') summary.warnings += 1;
        else summary.infos += 1;
    }

    return { profile, score: scoreIssues(issues), issues, summary };
}

function push(context: LintContext, issue: Omit<LintIssue, 'id'>): void {
    const subject =
        issue.elementId ?? issue.sceneId ?? issue.trackId ?? 'project';
    context.issues.push({ id: `${issue.rule}:${subject}`, ...issue });
}

/** Where an element lives, for the issue's locator fields. */
function locate(
    entry: TimelineEntry,
): Pick<LintIssue, 'elementId' | 'sceneId' | 'trackId' | 'timeMs'> {
    return {
        elementId: entry.id,
        sceneId: entry.origin === 'scene' ? entry.container_id : undefined,
        trackId: entry.origin === 'track' ? entry.container_id : undefined,
        timeMs: entry.start_ms,
    };
}

function elementLabel(entry: TimelineEntry): string {
    if (entry.type === 'text') {
        const text = ((entry as TextLayer).text ?? '').trim();
        return text ? `Text "${truncate(text, 24)}"` : 'Text element';
    }

    if (entry.brand_role) {
        return `${capitalize(entry.brand_role)} element`;
    }

    return `${capitalize(entry.type)} element`;
}

function truncate(value: string, max: number): string {
    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Static geometry at the element's own start, keyframes applied. */
function startBox(entry: TimelineEntry): Box {
    const animated = applyKeyframes(entry, entry.keyframes, 0);
    return {
        x: finite(animated.x),
        y: finite(animated.y),
        width: Math.max(0, finite(animated.width)),
        height: Math.max(0, finite(animated.height)),
    };
}

function finite(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function intersectionArea(a: Box, b: Box): number {
    const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const height =
        Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);

    return width > 0 && height > 0 ? width * height : 0;
}

function zoneBox(zone: SafeZone, width: number, height: number): Box {
    return {
        x: zone.x * width,
        y: zone.y * height,
        width: zone.width * width,
        height: zone.height * height,
    };
}

/** True when a box overlaps a safe zone by more than the tolerated share. */
export function boxIntersectsSafeZone(
    box: Box,
    zone: SafeZone,
    canvasWidth: number,
    canvasHeight: number,
): boolean {
    const area = box.width * box.height;
    if (area <= 0) {
        return false;
    }

    return (
        intersectionArea(box, zoneBox(zone, canvasWidth, canvasHeight)) / area >
        SAFE_ZONE_OVERLAP_SHARE
    );
}

// ---------------------------------------------------------------------------
// Element rules
// ---------------------------------------------------------------------------

function lintElements(context: LintContext): void {
    const { project, timeline, profile, kit } = context;
    const canvasWidth = project.resolution_width;
    const canvasHeight = project.resolution_height;
    const canvas: Box = {
        x: 0,
        y: 0,
        width: canvasWidth,
        height: canvasHeight,
    };
    const assetIds = Array.isArray(project.assets)
        ? new Set(project.assets.map((asset) => asset.id))
        : null;

    for (const entry of timeline.elements) {
        const box = startBox(entry);
        const label = elementLabel(entry);
        const where = locate(entry);
        const isSafeZoneSubject =
            entry.type === 'text' ||
            entry.brand_role === 'logo' ||
            entry.brand_role === 'watermark';

        if (isSafeZoneSubject) {
            for (const zone of profile.safeZones) {
                if (
                    boxIntersectsSafeZone(box, zone, canvasWidth, canvasHeight)
                ) {
                    push(context, {
                        rule: 'safe-zone',
                        severity: 'warning',
                        message: `${label} sits under the ${zone.label}, where the platform UI covers it.`,
                        fix: 'Move it inside the safe area.',
                        ...where,
                    });
                    break;
                }
            }
        }

        const area = box.width * box.height;
        if (area > 0) {
            const outside = 1 - intersectionArea(box, canvas) / area;
            if (outside > OUT_OF_CANVAS_SHARE) {
                push(context, {
                    rule: 'out-of-canvas',
                    severity: 'warning',
                    message: `${label} extends ${Math.round(outside * 100)}% outside the canvas.`,
                    fix: 'Move or resize it to fit the canvas.',
                    ...where,
                });
            }
        }

        if (entry.type === 'text') {
            lintText(context, entry as TimelineEntry & TextLayer, label, where);
        }

        if (
            (entry.type === 'video' || entry.type === 'image') &&
            assetIds !== null
        ) {
            const assetId = (entry as { asset_id?: unknown }).asset_id;
            if (typeof assetId !== 'number' || !assetIds.has(assetId)) {
                push(context, {
                    rule: 'missing-asset',
                    severity: 'error',
                    message: `${label} references asset ${String(assetId)}, which is not in this project.`,
                    fix: 'Replace it with an asset from the library or remove it.',
                    ...where,
                });
            }
        }

        if (entry.brand_role === 'logo' && kit) {
            if (box.width < profile.minLogoFraction * canvasWidth) {
                push(context, {
                    rule: 'brand-logo-small',
                    severity: 'warning',
                    message: `The logo is narrower than ${Math.round(profile.minLogoFraction * 100)}% of the canvas and will not read on a phone.`,
                    fix: 'Scale the logo up.',
                    ...where,
                });
            }
        }
    }
}

function lintText(
    context: LintContext,
    text: TimelineEntry & TextLayer,
    label: string,
    where: ReturnType<typeof locate>,
): void {
    const { project, profile, kit } = context;
    const fraction = finite(text.font_size) / project.resolution_height;

    if (fraction < profile.minTextFraction.error) {
        push(context, {
            rule: 'text-too-small',
            severity: 'error',
            message: `${label} is ${Math.round(finite(text.font_size))}px tall, unreadable on a phone.`,
            fix: `Use at least ${Math.ceil(profile.minTextFraction.warn * project.resolution_height)}px.`,
            ...where,
        });
    } else if (fraction < profile.minTextFraction.warn) {
        push(context, {
            rule: 'text-too-small',
            severity: 'warning',
            message: `${label} is ${Math.round(finite(text.font_size))}px tall, small for a phone screen.`,
            fix: `Use at least ${Math.ceil(profile.minTextFraction.warn * project.resolution_height)}px.`,
            ...where,
        });
    }

    const foreground = parseColor(resolveBrandColor(text.font_color, kit));
    const background = textBackground(context, text);

    if (foreground && background) {
        const ratio = contrastRatio(foreground, background);
        if (ratio < MIN_CONTRAST_RATIO) {
            push(context, {
                rule: 'low-contrast',
                severity: 'warning',
                message: `${label} has a contrast ratio of ${ratio.toFixed(1)}:1 against its background.`,
                fix: 'Pick a lighter or darker text colour, or add a stroke or background box.',
                ...where,
            });
        }
    }
}

/**
 * The colour a text element is read against: its own background box when it
 * has one, otherwise the scene background. Media behind it cannot be judged
 * statically, so a text over a video or image is skipped rather than guessed.
 */
function textBackground(
    context: LintContext,
    text: TimelineEntry & TextLayer,
): Rgba | null {
    const { project, timeline, kit } = context;
    const own = parseColor(resolveBrandColor(text.background_color, kit));
    if (own && own.a >= 0.5) {
        return own;
    }

    const box = startBox(text);
    const coveredByMedia = timeline.elements.some((other) => {
        if (other.id === text.id || other.z_index > text.z_index) {
            return false;
        }
        if (other.type !== 'video' && other.type !== 'image') {
            return false;
        }
        if (other.end_ms <= text.start_ms || other.start_ms >= text.end_ms) {
            return false;
        }

        return intersectionArea(startBox(other), box) > 0;
    });

    if (coveredByMedia) {
        return null;
    }

    const sceneId = text.origin === 'scene' ? text.container_id : null;
    const scene =
        (sceneId &&
            project.scenes.find((candidate) => candidate.id === sceneId)) ||
        project.scenes.find((candidate) =>
            timeline.scenes.find((view) => view.id === candidate.id),
        );

    return parseColor(
        resolveBrandColor(scene?.background_color, kit) ?? '#000000',
    );
}

// ---------------------------------------------------------------------------
// Timeline rules
// ---------------------------------------------------------------------------

function lintHook(context: LintContext): void {
    const { timeline, profile } = context;
    const window = profile.hookWindowMs;
    if (window === null || timeline.elements.length === 0) {
        return;
    }

    const hooked = timeline.elements.some((entry) => {
        if (entry.start_ms > window) {
            return false;
        }

        if (entry.type === 'text') {
            return true;
        }

        const tracks = entry.keyframes;
        return (
            !!tracks &&
            Object.values(tracks).some((track) => (track?.length ?? 0) > 1)
        );
    });

    if (!hooked) {
        push(context, {
            rule: 'hook-missing',
            severity: 'warning',
            message: `Nothing grabs attention in the first ${window / 1000}s: no text and no motion.`,
            fix: 'Open with a headline or an animated element.',
            timeMs: 0,
        });
    }
}

function lintPacing(context: LintContext): void {
    const { timeline, profile } = context;
    const scenes = timeline.scenes;

    if (profile.maxSceneMs !== null) {
        for (const scene of scenes) {
            if (scene.durationMs > profile.maxSceneMs) {
                push(context, {
                    rule: 'scene-too-long',
                    severity: 'warning',
                    message: `Scene "${scene.name}" runs ${(scene.durationMs / 1000).toFixed(1)}s without a cut.`,
                    fix: `Split it or shorten it below ${profile.maxSceneMs / 1000}s.`,
                    sceneId: scene.id,
                    timeMs: scene.startMs,
                });
            }
        }
    }

    if (profile.targetAvgSceneMs !== null && scenes.length > 0) {
        const average =
            scenes.reduce((total, scene) => total + scene.durationMs, 0) /
            scenes.length;

        if (average > profile.targetAvgSceneMs) {
            push(context, {
                rule: 'pacing-slow',
                severity: 'warning',
                message: `Scenes average ${(average / 1000).toFixed(1)}s; short-form pacing wants under ${profile.targetAvgSceneMs / 1000}s.`,
                fix: 'Add cuts or trim scenes.',
            });
        }
    }
}

function lintDuration(context: LintContext): void {
    const { timeline, profile } = context;
    const duration = timeline.durationMs;

    if (profile.maxDurationMs !== null) {
        if (duration > profile.maxDurationMs.error) {
            push(context, {
                rule: 'duration-over',
                severity: 'error',
                message: `The video is ${(duration / 1000).toFixed(0)}s, over the ${profile.maxDurationMs.error / 1000}s hard limit.`,
                fix: 'Cut it down.',
            });
        } else if (duration > profile.maxDurationMs.warn) {
            push(context, {
                rule: 'duration-over',
                severity: 'warning',
                message: `The video is ${(duration / 1000).toFixed(0)}s; completion rates drop past ${profile.maxDurationMs.warn / 1000}s.`,
                fix: 'Tighten the middle.',
            });
        }
    }

    if (
        profile.minDurationMs !== null &&
        duration > 0 &&
        duration < profile.minDurationMs
    ) {
        push(context, {
            rule: 'duration-short',
            severity: 'warning',
            message: `The video is only ${(duration / 1000).toFixed(1)}s long.`,
            fix: `Aim for at least ${profile.minDurationMs / 1000}s.`,
        });
    }
}

function lintAudio(context: LintContext): void {
    const { project, timeline } = context;
    const clips: AudioClip[] = (project.audio_tracks ?? []).flatMap(
        (track) => track.clips ?? [],
    );

    if (clips.length === 0) {
        return;
    }

    const hasCaptions = (project.subtitle_tracks ?? []).some(
        (track) => track.enabled !== false && (track.entries?.length ?? 0) > 0,
    );

    if (!hasCaptions) {
        push(context, {
            rule: 'captions-missing',
            severity: 'warning',
            message:
                'The project has audio but no captions; most viewers watch muted.',
            fix: 'Transcribe the voiceover or add a subtitle track.',
        });
    }

    const intervals = clips
        .map((clip) => ({
            start: finite(clip.start_ms),
            end: finite(clip.start_ms) + finite(clip.duration_ms),
        }))
        .filter((interval) => interval.end > interval.start)
        .sort((a, b) => a.start - b.start);

    let coveredUntil = -Infinity;
    for (const interval of intervals) {
        if (
            coveredUntil !== -Infinity &&
            interval.start - coveredUntil > AUDIO_GAP_MS &&
            interval.start <= timeline.durationMs
        ) {
            push(context, {
                rule: 'audio-gap',
                severity: 'info',
                message: `${((interval.start - coveredUntil) / 1000).toFixed(1)}s of silence before ${(interval.start / 1000).toFixed(1)}s.`,
                fix: 'Fill it with music or tighten the cut.',
                timeMs: coveredUntil,
            });
        }
        coveredUntil = Math.max(coveredUntil, interval.end);
    }
}

function lintScenes(context: LintContext): void {
    const { project, timeline } = context;

    for (const scene of project.scenes ?? []) {
        const hasOverlay = timeline.elements.some((entry) => {
            if (entry.origin !== 'track') return false;
            const view = timeline.scenes.find((view) => view.id === scene.id);
            if (!view) return false;
            return (
                entry.start_ms < view.startMs + view.durationMs &&
                entry.end_ms > view.startMs
            );
        });

        if ((scene.layers?.length ?? 0) === 0 && !hasOverlay) {
            const view = timeline.scenes.find((view) => view.id === scene.id);
            push(context, {
                rule: 'empty-scene',
                severity: 'warning',
                message: `Scene "${scene.name ?? scene.id}" has nothing in it.`,
                fix: 'Add media or text, or delete the scene.',
                sceneId: scene.id,
                timeMs: view?.startMs,
            });
        }
    }
}

// ---------------------------------------------------------------------------
// Brand rules
// ---------------------------------------------------------------------------

function lintBrand(context: LintContext): void {
    const { timeline, kit } = context;
    if (!kit) {
        return;
    }

    const palette = new Set(
        (Object.values(kit.colors ?? {}) as unknown[])
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.toLowerCase()),
    );
    const fonts = new Set(
        (Object.values(kit.fonts ?? {}) as unknown[]).filter(
            (value): value is string => typeof value === 'string',
        ),
    );

    for (const entry of timeline.elements) {
        const label = elementLabel(entry);
        const where = locate(entry);

        if (entry.type === 'text') {
            const text = entry as TimelineEntry & TextLayer;
            checkPalette(context, text.font_color, palette, label, where);
            checkPalette(context, text.background_color, palette, label, where);

            const family = text.font_family;
            if (
                fonts.size > 0 &&
                typeof family === 'string' &&
                family !== '' &&
                !isBrandToken(family) &&
                !fonts.has(family)
            ) {
                push(context, {
                    rule: 'brand-font',
                    severity: 'warning',
                    message: `${label} uses "${family}", which is not a brand font.`,
                    fix: 'Switch it to a brand font token.',
                    ...where,
                });
            }
        }

        if (entry.type === 'shape') {
            const shape = entry as TimelineEntry & ShapeLayer;
            checkPalette(context, shape.fill_color, palette, label, where);
            checkPalette(context, shape.border_color, palette, label, where);
        }
    }

    const hasLogo = Object.values(kit.logos ?? {}).some(
        (value) => typeof value === 'number',
    );
    if (
        hasLogo &&
        !timeline.elements.some((entry) => entry.brand_role === 'logo')
    ) {
        push(context, {
            rule: 'brand-logo-missing',
            severity: 'info',
            message: 'The brand kit has a logo but the video never shows it.',
            fix: 'Place the logo mark inside the safe area.',
        });
    }

    if (
        typeof kit.outro_asset_id === 'number' &&
        !timeline.elements.some(
            (entry) =>
                (entry as { asset_id?: unknown }).asset_id ===
                kit.outro_asset_id,
        )
    ) {
        push(context, {
            rule: 'brand-outro-missing',
            severity: 'info',
            message:
                'The brand kit has an outro that the video does not end with.',
            fix: 'Add the outro as the last scene.',
        });
    }

    if (
        typeof kit.watermark?.asset_id === 'number' &&
        !timeline.elements.some((entry) => entry.brand_role === 'watermark')
    ) {
        push(context, {
            rule: 'brand-watermark-missing',
            severity: 'info',
            message:
                'The brand kit defines a watermark that is not on the video.',
            fix: 'Add the watermark element.',
        });
    }
}

function checkPalette(
    context: LintContext,
    value: string | null | undefined,
    palette: Set<string>,
    label: string,
    where: ReturnType<typeof locate>,
): void {
    if (
        palette.size === 0 ||
        typeof value !== 'string' ||
        value === '' ||
        value === 'transparent' ||
        isBrandToken(value)
    ) {
        return;
    }

    if (!palette.has(value.toLowerCase())) {
        // One issue per element, even when two of its fields are off-palette.
        const id = `brand-off-palette:${where.elementId}`;
        if (context.issues.some((issue) => issue.id === id)) {
            return;
        }

        push(context, {
            rule: 'brand-off-palette',
            severity: 'warning',
            message: `${label} uses ${value}, which is not in the brand palette.`,
            fix: 'Use a brand colour token such as brand.primary.',
            ...where,
        });
    }
}

// ---------------------------------------------------------------------------
// Colour maths (WCAG relative luminance)
// ---------------------------------------------------------------------------

type Rgba = { r: number; g: number; b: number; a: number };

/** Parse #rgb, #rgba, #rrggbb and #rrggbbaa. Anything else is unknown. */
export function parseColor(value: string | null | undefined): Rgba | null {
    if (typeof value !== 'string') {
        return null;
    }

    const hex = value.trim().replace(/^#/, '');
    if (!/^[0-9a-f]{3,8}$/i.test(hex)) {
        return null;
    }

    const expand = (short: string): string =>
        short.length <= 4
            ? short
                  .split('')
                  .map((char) => char + char)
                  .join('')
            : short;

    const full = expand(hex);
    if (full.length !== 6 && full.length !== 8) {
        return null;
    }

    const channel = (offset: number): number =>
        parseInt(full.slice(offset, offset + 2), 16);

    return {
        r: channel(0),
        g: channel(2),
        b: channel(4),
        a: full.length === 8 ? channel(6) / 255 : 1,
    };
}

function luminance({ r, g, b }: Rgba): number {
    const linear = (channel: number): number => {
        const c = channel / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };

    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function contrastRatio(a: Rgba, b: Rgba): number {
    const la = luminance(a);
    const lb = luminance(b);
    const [light, dark] = la > lb ? [la, lb] : [lb, la];

    return (light + 0.05) / (dark + 0.05);
}

export { DEFAULT_LINT_PROFILE, type LintProfileId };
