import type {
    Asset,
    BrandKit,
    ImageLayer,
    MediaFit,
    Project,
    ShapeLayer,
    SubtitleEntry,
    SubtitleTrack,
    TextLayer,
    VideoLayer,
} from '@/types/editor';
import { clampSpeed, clampVolume, resolveAdjustments } from '../clip-effects';
import { resolveBrandColor, resolveBrandFont } from './brand';
import { emptyFrame } from './frame';
import type {
    CompositedFrame,
    ResolvedElement,
    ResolvedFrame,
    ResolvedSubtitle,
    ResolvedSubtitleWord,
} from './frame';
import { applyKeyframes } from './keyframes';
import { DEFAULT_LINE_HEIGHT } from './text-layout';
import {
    buildTimeline,
    elementsAt,
    mapTimelineMs,
    sceneIndexAt,
    transitionAt,
} from './timeline';
import type { Timeline, TimelineEntry } from './timeline';

/**
 * Resolve a project into a paintable frame.
 *
 * This is the keystone of the unified model: the ONLY place that knows how
 * scenes, tracks, trims, speeds, keyframes, transitions and subtitles combine
 * into what is on screen at time T. The preview calls it every frame and the
 * exporter calls it every frame, so the two cannot drift the way they did when
 * each walked the project itself — the preview stretching media with
 * `object-cover` while the export stretched it, the preview highlighting one
 * subtitle word while the export highlighted all of them, the preview ignoring
 * transitions while the export shortened the timeline for them.
 *
 * Pure: no store access, no I/O, no mutation of the project.
 */

export type ResolveFrameOptions = {
    /**
     * A timeline built earlier. Export loops resolve thousands of frames from
     * one unchanging project, and rebuilding the timeline per frame is pure
     * waste; a caller that passes a stale timeline gets a stale frame, which is
     * the normal bargain for a cache.
     */
    timeline?: Timeline;
    /** Skip transition resolution when the caller paints frames individually. */
    includeTransitions?: boolean;
};

const DEFAULT_BACKGROUND = '#000000';
const DEFAULT_FONT_FAMILY = 'system-ui';

export function resolveFrame(
    project: Project | null | undefined,
    timeMs: number,
    options: ResolveFrameOptions = {},
): CompositedFrame {
    const width = project?.resolution_width ?? 1920;
    const height = project?.resolution_height ?? 1080;

    if (!project) {
        return { primary: emptyFrame(timeMs, width, height) };
    }

    const timeline = options.timeline ?? buildTimeline(project);
    const time = Math.max(0, timeMs);

    const transition =
        options.includeTransitions === false
            ? null
            : transitionAt(timeline, time);

    const outgoingSceneId = transition
        ? timeline.scenes[transition.index].id
        : (timeline.scenes[sceneIndexAt(timeline, time)]?.id ?? null);

    const primary = resolveSceneFrame(project, timeline, time, outgoingSceneId);

    if (!transition) {
        return { primary };
    }

    const incomingSceneId = timeline.scenes[transition.index + 1].id;

    return {
        primary,
        transition: {
            type: transition.type,
            progress: transition.progress,
            incoming: resolveSceneFrame(
                project,
                timeline,
                time,
                incomingSceneId,
            ),
        },
    };
}

/**
 * Resolve one frame as seen from a single scene.
 *
 * During a transition the two scenes genuinely overlap in output time, so an
 * unfiltered "everything live at T" query would paint both at once. Filtering
 * to one scene is what lets the two sides of a transition be resolved
 * independently and then blended.
 *
 * Overlay clips and subtitles are included on BOTH sides. For fades, dissolves
 * and wipes that is exactly right — blending identical pixels is a no-op, so an
 * overlay reads as unaffected by the transition, which is what the renderer
 * does by compositing overlays after the xfade chain. For slide transitions the
 * overlay travels with the frame; that is a deliberate, documented trade for
 * keeping this function a pure per-scene resolve.
 */
function resolveSceneFrame(
    project: Project,
    timeline: Timeline,
    timeMs: number,
    sceneId: string | null,
): ResolvedFrame {
    const scene = timeline.scenes.find((candidate) => candidate.id === sceneId);
    const kit = project.brand_kit ?? null;
    const frame = emptyFrame(
        timeMs,
        project.resolution_width,
        project.resolution_height,
        resolveBrandColor(scene?.backgroundColor, kit) ?? DEFAULT_BACKGROUND,
    );

    const assets = new Map<number, Asset>(
        (project.assets ?? []).map((asset) => [asset.id, asset]),
    );

    for (const entry of elementsAt(timeline, timeMs)) {
        if (entry.origin === 'scene' && entry.container_id !== sceneId) {
            continue;
        }

        const resolved = resolveElement(entry, timeMs, assets, kit);
        if (resolved) {
            frame.elements.push(resolved);
        }
    }

    frame.elements.sort((a, b) => a.zIndex - b.zIndex);
    frame.subtitles = resolveSubtitles(project, timeMs);

    return frame;
}

/**
 * Resolve one element, or null when it cannot be painted.
 *
 * Unknown `type` values return null rather than throwing. Production data
 * already contains at least one element type the editor never shipped
 * (`type: "effect"`), and a project must stay openable even when part of it
 * means nothing to this version of the app.
 */
function resolveElement(
    entry: TimelineEntry,
    timeMs: number,
    assets: Map<number, Asset>,
    kit: BrandKit | null,
): ResolvedElement | null {
    const localTimeMs = timeMs - entry.start_ms;
    const animated = applyKeyframes(entry, entry.keyframes, localTimeMs);

    const base = {
        id: animated.id,
        origin: entry.origin,
        containerId: entry.container_id,
        zIndex: entry.z_index,
        x: numberOr(animated.x, 0),
        y: numberOr(animated.y, 0),
        width: numberOr(animated.width, 0),
        height: numberOr(animated.height, 0),
        rotation: numberOr(animated.rotation, 0),
        opacity: clamp01(numberOr(animated.opacity, 1)),
        localTimeMs,
    };

    switch (animated.type) {
        case 'video':
        case 'image': {
            const media = animated as VideoLayer | ImageLayer;
            const asset = assets.get(media.asset_id) ?? null;

            return {
                ...base,
                kind: media.type,
                assetId: media.asset_id,
                url: asset?.url ?? asset?.thumbnail_url ?? null,
                fit: (media.fit ?? 'cover') as MediaFit,
                adjustments: resolveAdjustments(media.adjustments) as {
                    brightness: number;
                    contrast: number;
                    saturation: number;
                },
                sourceTimeSec:
                    media.type === 'video'
                        ? sourceTimeSec(media as VideoLayer, localTimeMs, asset)
                        : null,
                volume: clampVolume(
                    media.type === 'video'
                        ? ((animated as VideoLayer).volume ?? 1)
                        : 0,
                ),
                muted:
                    media.type === 'video'
                        ? ((media as VideoLayer).muted ?? false)
                        : true,
            };
        }

        case 'text': {
            const text = animated as TextLayer;

            return {
                ...base,
                kind: 'text',
                text: text.text ?? '',
                fontFamily:
                    resolveBrandFont(text.font_family, kit) ??
                    DEFAULT_FONT_FAMILY,
                fontSize: numberOr(text.font_size, 48),
                fontWeight: text.font_weight === 'bold' ? 'bold' : 'normal',
                color: resolveBrandColor(text.font_color, kit) ?? '#ffffff',
                align: text.text_align ?? 'center',
                // The inspector's box is vertically centred (`items-center`),
                // so centring is the behaviour users have already composed to.
                verticalAlign: 'middle',
                padding: numberOr(text.padding, 0),
                lineHeight: DEFAULT_LINE_HEIGHT,
                letterSpacing: 0,
                backgroundColor: paintColor(
                    resolveBrandColor(text.background_color, kit),
                ),
                backgroundRadius: 0,
                strokeColor: paintColor(
                    resolveBrandColor(text.stroke_color, kit),
                ),
                strokeWidth: Math.max(0, numberOr(text.stroke_width, 0)),
            };
        }

        case 'shape': {
            const shape = animated as ShapeLayer;

            return {
                ...base,
                kind: 'shape',
                shape: shape.shape,
                fillColor: paintColor(resolveBrandColor(shape.fill_color, kit)),
                borderColor: paintColor(
                    resolveBrandColor(shape.border_color, kit),
                ),
                borderWidth: Math.max(0, numberOr(shape.border_width, 0)),
                cornerRadius: Math.max(0, numberOr(shape.corner_radius, 0)),
            };
        }

        default:
            return null;
    }
}

/**
 * Where in the SOURCE media this element is, in seconds.
 *
 * Trim and speed fold in here so nothing downstream has to know about either.
 * Returns null once the trimmed source is exhausted, which means "hold the last
 * frame": the renderer pads with `tpad`, holding the final frame rather than
 * going black, so resolving to null (rather than to a blank element) is what
 * keeps the preview honest.
 */
function sourceTimeSec(
    layer: VideoLayer,
    localTimeMs: number,
    asset: Asset | null,
): number | null {
    const trimStartMs = Math.max(0, layer.trim_start_ms ?? 0);
    const speed = clampSpeed(layer.speed);
    const sourceMs = trimStartMs + Math.max(0, localTimeMs) * speed;

    const contentEndMs = layer.trim_end_ms ?? asset?.duration_ms ?? null;
    if (contentEndMs !== null && Number.isFinite(contentEndMs)) {
        if (sourceMs >= contentEndMs) {
            return null;
        }
    }

    return sourceMs / 1000;
}

/**
 * Resolve every visible subtitle at this instant.
 *
 * Word state follows ASS `\k` semantics, which is what the burn-in produces:
 * a word becomes `active` when the playhead reaches it and STAYS active for the
 * rest of the entry, so the caption fills in progressively. `current` is true
 * only while the playhead is inside the word and exists for the emphasis pop.
 * The preview used to highlight exactly one word and the export all words up to
 * the playhead; carrying both flags lets one renderer satisfy both intents.
 */
function resolveSubtitles(
    project: Project,
    timeMs: number,
): ResolvedSubtitle[] {
    const tracks = (project.subtitle_tracks ?? []).filter(
        (track) => track.enabled !== false,
    );
    if (tracks.length === 0) {
        return [];
    }

    const scenes = project.scenes ?? [];
    const fps = project.fps || 30;
    const resolved: ResolvedSubtitle[] = [];

    for (const track of tracks) {
        for (const entry of track.entries ?? []) {
            const startMs = mapTimelineMs(scenes, entry.start_ms ?? 0, fps);
            const endMs = mapTimelineMs(scenes, entry.end_ms ?? 0, fps);

            if (timeMs < startMs || timeMs >= endMs) {
                continue;
            }

            resolved.push(resolveSubtitle(track, entry, timeMs, project, fps));
        }
    }

    return resolved;
}

function resolveSubtitle(
    track: SubtitleTrack,
    entry: SubtitleEntry,
    timeMs: number,
    project: Project,
    fps: number,
): ResolvedSubtitle {
    const style = track.style ?? ({} as SubtitleTrack['style']);
    const uppercase = style.text_transform === 'uppercase';
    const scenes = project.scenes ?? [];
    const kit = project.brand_kit ?? null;

    const words: ResolvedSubtitleWord[] = (entry.words ?? []).map((word) => {
        const startMs = mapTimelineMs(scenes, word.start_ms ?? 0, fps);
        const endMs = mapTimelineMs(scenes, word.end_ms ?? 0, fps);

        return {
            text: uppercase ? word.text.toUpperCase() : word.text,
            active: timeMs >= startMs,
            current: timeMs >= startMs && timeMs < endMs,
        };
    });

    const text = uppercase
        ? (entry.text ?? '').toUpperCase()
        : (entry.text ?? '');

    return {
        id: entry.id,
        text,
        words,
        fontFamily:
            resolveBrandFont(style.font_family, kit) ?? 'Arial, sans-serif',
        fontSize: numberOr(style.font_size, 48),
        color: resolveBrandColor(style.font_color, kit) ?? '#ffffff',
        highlightColor: paintColor(
            resolveBrandColor(style.highlight_color, kit),
        ),
        backgroundColor: paintColor(
            resolveBrandColor(style.background_color, kit),
        ),
        strokeColor: paintColor(resolveBrandColor(style.stroke_color, kit)),
        strokeWidth: Math.max(0, numberOr(style.stroke_width, 0)),
        position: style.position === 'top' ? 'top' : 'bottom',
        // Proportional margins keep captions in the same relative place at any
        // resolution; ASS margins are in PlayRes units, which is exactly the
        // project resolution, so the same numbers work for the burn-in.
        marginV: Math.round(project.resolution_height * 0.05),
        marginH: Math.round(project.resolution_width * 0.05),
        uppercase,
    };
}

function numberOr(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value)
        ? value
        : fallback;
}

function clamp01(value: number): number {
    return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** '' and 'transparent' both mean "do not paint", which the type spells null. */
function paintColor(color: string | null | undefined): string | null {
    if (!color || color === 'transparent') {
        return null;
    }

    return color;
}
