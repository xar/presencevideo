import type {
    Project,
    Scene,
    SceneTransition,
    TimelineElement,
    TransitionType,
} from '@/types/editor';
import { MAX_TRANSITION_MS } from '../transitions';
import type { ElementOrigin } from './frame';

/**
 * The derived, unified timeline.
 *
 * Storage still has two shapes — layers nested in scenes, clips nested in video
 * tracks — because existing projects are full of both and no data migration is
 * worth the risk. This module is the one place that reads those shapes and
 * produces the shape everything else works with: a flat list of elements with
 * ABSOLUTE times, a flat list of tracks, and scenes reduced to what they
 * actually are in the new model — a named, ordered grouping with a duration.
 *
 * It is a pure function of the project: no store access, no I/O, no mutation of
 * the input. Build it once per project change and pass it around.
 */

/** A scene as the new model sees it: a VIEW over the timeline, not a container. */
export type SceneView = {
    id: string;
    name: string;
    /** Absolute start in OUTPUT time (transition overlap already removed). */
    startMs: number;
    durationMs: number;
    /** Transition into the next scene, clamped as the renderer clamps it. */
    transition: SceneTransition | null;
    backgroundColor: string | null;
};

export type TrackKind = 'scene' | 'video' | 'audio' | 'subtitle';

export type Track = {
    id: string;
    kind: TrackKind;
    name: string;
    visible: boolean;
    /** Lower renders first. Scene tracks sit below every overlay track. */
    order: number;
};

/**
 * An element with its provenance kept alongside its resolved timing.
 *
 * `origin`/`container_id` exist only so an editor can write an edit back to the
 * place the element is actually stored; nothing about painting depends on them.
 * Structurally this is still a `TimelineElement`, so consumers that only care
 * about the unified model can ignore the extra fields.
 */
export type TimelineEntry = TimelineElement & {
    origin: ElementOrigin;
    /** Scene id for scene layers, video track id for overlay clips. */
    container_id: string;
};

export type Timeline = {
    elements: TimelineEntry[];
    tracks: Track[];
    scenes: SceneView[];
    /** Output duration: raw scene durations MINUS transition overlap. */
    durationMs: number;
};

/** A resolved scene junction, mirroring `FFmpegService::resolveTransitions`. */
export type ResolvedTransition = {
    type: TransitionType;
    durationMs: number;
    /** False for the one-frame filler fades forced onto undeclared junctions. */
    declared: boolean;
};

const DEFAULT_TRANSITION_MS = 500;

function sceneDurationMs(scene: Scene | undefined): number {
    const value = Number(scene?.duration_ms ?? 0);
    return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

/**
 * Resolve the effective transition for every scene junction.
 *
 * Ported verbatim from `FFmpegService::resolveTransitions` because the preview
 * and the render disagreeing about duration is exactly the bug this model
 * exists to remove. The all-or-nothing rule is the renderer's: if NO scene
 * declares a transition the fast concat path runs and nothing overlaps; if ANY
 * scene declares one, the whole timeline goes through a single xfade chain and
 * every undeclared junction gets a one-frame fade so the chain stays uniform.
 */
export function resolveTransitions(
    scenes: readonly Scene[],
    fps = 30,
): ResolvedTransition[] {
    const count = scenes.length;
    if (count < 2) {
        return [];
    }

    const declaredAny = scenes
        .slice(0, count - 1)
        .some((scene) => !!scene.transition);

    if (!declaredAny) {
        return [];
    }

    const frameMs = Math.max(1, Math.round(1000 / Math.max(1, fps || 30)));
    const transitions: ResolvedTransition[] = [];

    for (let index = 0; index < count - 1; index++) {
        const declared = scenes[index].transition ?? null;
        const requestedMs = declared
            ? Math.round(Number(declared.duration_ms ?? DEFAULT_TRANSITION_MS))
            : frameMs;

        const maxMs = Math.min(
            MAX_TRANSITION_MS,
            Math.floor(sceneDurationMs(scenes[index]) / 2),
            Math.floor(sceneDurationMs(scenes[index + 1]) / 2),
        );

        transitions.push({
            type: declared?.type ?? 'fade',
            durationMs: Math.max(
                1,
                Math.min(
                    Number.isFinite(requestedMs) ? requestedMs : frameMs,
                    maxMs,
                ),
            ),
            declared: declared !== null,
        });
    }

    return transitions;
}

/**
 * Absolute start of every scene in OUTPUT time.
 *
 * Scene N starts where scene N-1 ends MINUS the transition between them,
 * because a transition overlaps the two scenes rather than sitting between
 * them. The preview used to sum raw durations and so ran longer than the file
 * it exported.
 */
export function sceneStartsMs(scenes: readonly Scene[], fps = 30): number[] {
    const transitions = resolveTransitions(scenes, fps);
    const starts: number[] = [];

    let cursor = 0;
    for (let index = 0; index < scenes.length; index++) {
        if (index > 0) {
            cursor -= transitions[index - 1]?.durationMs ?? 0;
        }
        starts.push(Math.max(0, cursor));
        cursor += sceneDurationMs(scenes[index]);
    }

    return starts;
}

/** Output duration of the whole project, transition overlap removed. */
export function totalDurationMs(project: Project | null | undefined): number {
    const scenes = project?.scenes ?? [];
    const raw = scenes.reduce((sum, scene) => sum + sceneDurationMs(scene), 0);
    const overlap = resolveTransitions(scenes, project?.fps ?? 30).reduce(
        (sum, transition) => sum + transition.durationMs,
        0,
    );

    return Math.max(0, raw - overlap);
}

/**
 * Map a time on the original (un-transitioned) timeline into output time.
 *
 * Overlay clips, audio clips and subtitles are all authored against raw scene
 * positions, so they shift earlier by whatever transition overlap accumulated
 * before the scene they fall in. Ported from `FFmpegService::mapTimelineMs`.
 */
export function mapTimelineMs(
    scenes: readonly Scene[],
    ms: number,
    fps = 30,
): number {
    const transitions = resolveTransitions(scenes, fps);
    if (transitions.length === 0) {
        return Math.round(ms);
    }

    let originalMs = 0;
    let shiftMs = 0;

    for (let index = 0; index < scenes.length; index++) {
        if (index > 0) {
            shiftMs += transitions[index - 1]?.durationMs ?? 0;
        }

        originalMs += sceneDurationMs(scenes[index]);

        if (ms < originalMs) {
            break;
        }
    }

    return Math.max(0, Math.round(ms - shiftMs));
}

/**
 * Lift a project into the unified timeline.
 *
 * ## Global z ordering
 *
 * There used to be two disjoint `z_index` namespaces — scene-scoped for layers,
 * track-scoped for clips — and the preview papered over the gap by forcing
 * every overlay clip above everything with a `z-[100]` class. The new model has
 * ONE order, chosen to reproduce exactly what users see today:
 *
 *   1. scene layers first, ordered by (scene index, `z_index`, array index);
 *   2. then every overlay clip, ordered by (`z_index`, track index, array index).
 *
 * So overlay clips still sit above scene content, clips still stack by their
 * own `z_index`, and ties resolve by authoring order — the same stable sort the
 * old code got for free from array order. The assigned `zIndex` is dense and
 * globally unique; new elements should be given `max + 1` rather than a
 * container-scoped value.
 */
export function buildTimeline(project: Project | null | undefined): Timeline {
    if (!project) {
        return { elements: [], tracks: [], scenes: [], durationMs: 0 };
    }

    const fps = project.fps || 30;
    const rawScenes = project.scenes ?? [];
    const starts = sceneStartsMs(rawScenes, fps);
    const transitions = resolveTransitions(rawScenes, fps);

    const scenes: SceneView[] = rawScenes.map((scene, index) => ({
        id: scene.id,
        name: scene.name ?? `Scene ${index + 1}`,
        startMs: starts[index],
        durationMs: sceneDurationMs(scene),
        transition:
            index < rawScenes.length - 1 && scene.transition
                ? {
                      type: scene.transition.type,
                      duration_ms:
                          transitions[index]?.durationMs ??
                          scene.transition.duration_ms,
                  }
                : null,
        backgroundColor: scene.background_color ?? null,
    }));

    const tracks: Track[] = [];
    const elements: TimelineEntry[] = [];
    let zIndex = 0;

    rawScenes.forEach((scene, sceneIndex) => {
        tracks.push({
            id: scene.id,
            kind: 'scene',
            name: scene.name ?? `Scene ${sceneIndex + 1}`,
            visible: true,
            order: sceneIndex,
        });
    });

    // Scene layers, in scene order, each scene's layers by their own z_index.
    rawScenes.forEach((scene, sceneIndex) => {
        const startMs = starts[sceneIndex];
        const endMs = startMs + sceneDurationMs(scene);

        orderByZIndex(scene.layers ?? []).forEach((layer) => {
            elements.push({
                ...(layer as TimelineElement),
                // Derived, never read from storage: a scene layer's stored
                // timing is only a compatibility mirror and goes stale the
                // moment its scene is retimed.
                start_ms: startMs,
                end_ms: endMs,
                track_id: scene.id,
                z_index: zIndex++,
                origin: 'scene',
                container_id: scene.id,
            });
        });
    });

    // Overlay clips above all scene content, ordered across tracks by z_index.
    const videoTracks = project.video_tracks ?? [];
    videoTracks.forEach((track, trackIndex) => {
        tracks.push({
            id: track.id,
            kind: 'video',
            name: track.name,
            visible: track.visible !== false,
            order: rawScenes.length + trackIndex,
        });
    });

    const clipEntries = videoTracks.flatMap((track, trackIndex) =>
        (track.clips ?? []).map((clip, clipIndex) => ({
            clip,
            track,
            trackIndex,
            clipIndex,
            visible: track.visible !== false,
        })),
    );

    clipEntries
        .sort(
            (a, b) =>
                (a.clip.z_index ?? 0) - (b.clip.z_index ?? 0) ||
                a.trackIndex - b.trackIndex ||
                a.clipIndex - b.clipIndex,
        )
        .forEach(({ clip, track, visible }) => {
            if (!visible) {
                return;
            }

            const startMs = mapTimelineMs(rawScenes, clip.start_ms ?? 0, fps);
            const durationMs = Math.max(0, Math.round(clip.duration_ms ?? 0));

            elements.push({
                ...(clip as unknown as TimelineElement),
                start_ms: startMs,
                end_ms: startMs + durationMs,
                track_id: track.id,
                z_index: zIndex++,
                origin: 'track',
                container_id: track.id,
            });
        });

    (project.audio_tracks ?? []).forEach((track, index) => {
        tracks.push({
            id: track.id,
            kind: 'audio',
            name: track.name,
            visible: !track.muted,
            order: rawScenes.length + videoTracks.length + index,
        });
    });

    (project.subtitle_tracks ?? []).forEach((track, index) => {
        tracks.push({
            id: track.id,
            kind: 'subtitle',
            name: track.name,
            visible: track.enabled !== false,
            order:
                rawScenes.length +
                videoTracks.length +
                (project.audio_tracks ?? []).length +
                index,
        });
    });

    return {
        elements,
        tracks,
        scenes,
        durationMs: totalDurationMs(project),
    };
}

/** Stable sort by `z_index`, falling back to authoring order on ties. */
function orderByZIndex<T extends { z_index?: number }>(
    items: readonly T[],
): T[] {
    return items
        .map((item, index) => ({ item, index }))
        .sort(
            (a, b) =>
                (a.item.z_index ?? 0) - (b.item.z_index ?? 0) ||
                a.index - b.index,
        )
        .map(({ item }) => item);
}

/** Elements live at an absolute time; `start_ms <= t < end_ms`. */
export function elementsAt(
    timeline: Timeline,
    timeMs: number,
): TimelineEntry[] {
    return timeline.elements.filter(
        (element) => element.start_ms <= timeMs && timeMs < element.end_ms,
    );
}

/** Index of the scene containing an absolute time, or -1. */
export function sceneIndexAt(timeline: Timeline, timeMs: number): number {
    const { scenes } = timeline;
    if (scenes.length === 0) {
        return -1;
    }

    for (let index = 0; index < scenes.length; index++) {
        if (timeMs < scenes[index].startMs + scenes[index].durationMs) {
            return index;
        }
    }

    return scenes.length - 1;
}

/**
 * The transition the playhead is inside, if any.
 *
 * A transition occupies the last `durationMs` of the outgoing scene, which is
 * also the first `durationMs` of the incoming one — the two genuinely overlap
 * in output time, which is why this is expressed as a junction rather than as a
 * third thing between them.
 */
export function transitionAt(
    timeline: Timeline,
    timeMs: number,
): { index: number; type: TransitionType; progress: number } | null {
    for (let index = 0; index < timeline.scenes.length - 1; index++) {
        const next = timeline.scenes[index + 1];
        const outgoing = timeline.scenes[index];
        const endMs = outgoing.startMs + outgoing.durationMs;
        const durationMs = endMs - next.startMs;

        if (durationMs <= 0) {
            continue;
        }

        if (timeMs >= next.startMs && timeMs < endMs) {
            return {
                index,
                type: outgoing.transition?.type ?? 'fade',
                progress: (timeMs - next.startMs) / durationMs,
            };
        }
    }

    return null;
}
