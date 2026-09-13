import type {
    AudioClip,
    AudioTrack,
    Layer,
    Project,
    Scene,
    SubtitleTrack,
    TimelineElement,
    VideoClip,
    VideoTrack,
} from '@/types';

/**
 * Coerce a project payload into the shape the editor assumes everywhere.
 *
 * Every consumer iterates nested lists unconditionally and reads `type` as a
 * discriminant, so this is the single place that fills gaps left by older
 * rows, partial editor payloads or agent-composed projects. It mutates and
 * returns the same object so callers keep referential identity where needed.
 */
/**
 * The fields normalisation actually touches.
 *
 * Widened from `Project` so a payload that is not yet a full project — the JSON
 * import and the JSON editor both produce one — cannot be applied to the store
 * without passing through here.
 */
export type NormalizableProject = Pick<
    Project,
    | 'resolution_width'
    | 'resolution_height'
    | 'scenes'
    | 'video_tracks'
    | 'audio_tracks'
    | 'subtitle_tracks'
>;

export function normalizeProject<T extends NormalizableProject>(project: T): T {
    const canvas = {
        width: project.resolution_width,
        height: project.resolution_height,
    };

    // Lift scene layers onto the unified timeline as we walk the scenes: the
    // enclosing scene is the only place their absolute timing exists, and this
    // is the one entry point every payload passes through, so the upgrade
    // happens lazily at load instead of as an SQL backfill. The precedent is
    // `2026_09_01_065314_backfill_canvas_element_defaults`, whose up()/down()
    // are deliberately empty for exactly this reason.
    let sceneStartMs = 0;
    project.scenes = (project.scenes ?? []).map((scene) => {
        const normalized = normalizeScene(scene, canvas, sceneStartMs);
        sceneStartMs += scene.duration_ms ?? 0;
        return normalized;
    });

    project.video_tracks = (project.video_tracks ?? []).map((track, index) =>
        normalizeVideoTrack(track, canvas, index),
    );
    project.audio_tracks = (project.audio_tracks ?? []).map((track, index) =>
        normalizeAudioTrack(track, index),
    );
    project.subtitle_tracks = (project.subtitle_tracks ?? []).map(
        (track, index) => normalizeSubtitleTrack(track, index),
    );

    return project;
}

export type CanvasSize = { width: number; height: number };

const DEFAULT_CANVAS: CanvasSize = { width: 1920, height: 1080 };

/**
 * `sceneStartMs` is the scene's prefix-sum start on the RAW timeline (before
 * transition overlap). Transition-aware output time is derived by
 * `buildTimeline()`, which is also authoritative for scene-layer timing: the
 * fields written here are a compatibility mirror so an element read in
 * isolation still describes when it plays, not a second source of truth that
 * could go stale when a scene is retimed.
 */
export function normalizeScene(
    scene: Scene,
    canvas: CanvasSize = DEFAULT_CANVAS,
    sceneStartMs = 0,
): Scene {
    const endMs = sceneStartMs + (scene.duration_ms ?? 0);

    scene.layers = (scene.layers ?? []).map((layer) => {
        const element = normalizeElement(layer, canvas);
        const timed = element as Partial<TimelineElement>;

        timed.start_ms ??= sceneStartMs;
        timed.end_ms ??= endMs;
        timed.track_id ??= scene.id;

        return element;
    });

    return scene;
}

/**
 * Shared defaults for anything rendered on the canvas (scene layers and
 * overlay clips). Legacy elements may lack a `type` (always video) or the
 * required text/shape fields the render assumes.
 */
export function normalizeElement<T extends Layer>(
    element: T,
    canvas: CanvasSize = DEFAULT_CANVAS,
): T {
    const raw = element as Partial<Layer> & Record<string, unknown>;
    raw.type ??= 'video';
    raw.x ??= 0;
    raw.y ??= 0;
    raw.width ??= Math.round(canvas.width / 4);
    raw.height ??= Math.round(canvas.height / 4);
    raw.z_index ??= 0;

    // Media stretched in both export paths while the preview used
    // `object-cover`; 'cover' is the chosen default, written explicitly so the
    // stored project says what it means instead of leaning on renderer defaults.
    if (raw.type === 'video' || raw.type === 'image') {
        raw.fit ??= 'cover';
    }

    // NOTE: non-canonical values already in production data (`shape: "rect"`
    // instead of `rectangle`, `align` instead of `text_align`,
    // `font_weight: "600"`) and element types this version never shipped
    // (`type: "effect"`) are left EXACTLY as they are. Normalising fills gaps;
    // rewriting a user's stored values is a separate, deliberate decision and
    // does not belong here.
    if (raw.type === 'text') {
        raw.text ??= '';
        raw.font_size ??= 48;
        raw.font_color ??= '#ffffff';
    }

    if (raw.type === 'shape') {
        raw.shape ??= 'rectangle';
        raw.fill_color ??= '#ffffff';
    }

    return element;
}

/**
 * A track's `name` is a display label, but every consumer — the track header,
 * the inspector, the save request — assumes it exists. Agent-composed projects
 * carry tracks without one, so it is defaulted here to the same label the
 * editor gives a track it creates itself.
 */
export function normalizeVideoTrack(
    track: VideoTrack,
    canvas: CanvasSize = DEFAULT_CANVAS,
    index = 0,
): VideoTrack {
    track.name ||= `Video Track ${index + 1}`;
    track.clips = (track.clips ?? []).map((clip) =>
        normalizeVideoClip(clip, canvas),
    );
    return track;
}

export function normalizeVideoClip(
    clip: VideoClip,
    canvas: CanvasSize = DEFAULT_CANVAS,
): VideoClip {
    return normalizeElement(clip, canvas);
}

export function normalizeAudioTrack(track: AudioTrack, index = 0): AudioTrack {
    track.name ||= `Track ${index + 1}`;
    track.clips = (track.clips ?? []).map(normalizeAudioClip);
    return track;
}

/** Duration used when a clip carries no usable timing at all. */
const FALLBACK_AUDIO_CLIP_DURATION_MS = 5000;

/**
 * Fill an audio clip's timing so both spellings of it agree.
 *
 * Audio clips are the one part of the timeline that never moved to absolute
 * `start_ms`/`end_ms`: the inspector, the drag gesture, the split, the audio
 * plan and the PHP renderer all read `duration_ms`. The AI agent, meanwhile,
 * composes audio clips through the same tool that documents every element as
 * `start_ms`/`end_ms`, so it writes `end_ms` and no `duration_ms` at all —
 * which read back as `undefined`, surfaced as a `NaN:NaN.NaN` duration, made
 * the clip undraggable (the gesture spans `NaN` milliseconds) and dropped the
 * clip from the audio plan entirely.
 *
 * Rather than pick a winner, both are kept in step, exactly as scene layers
 * keep a compatibility mirror of their absolute timing. `end_ms` stays exclusive
 * and is always `start_ms + duration_ms`.
 */
export function normalizeAudioClip(clip: AudioClip): AudioClip {
    clip.start_ms = finiteOr(clip.start_ms, 0);
    clip.volume ??= 1;
    clip.trim_start_ms ??= 0;

    return syncAudioClipTiming(clip);
}

/**
 * Reconcile `duration_ms` and `end_ms` on a clip that already has a start.
 *
 * `prefer` decides which side is authoritative when both are present, so a
 * caller that just wrote one of them does not get it overwritten by the other's
 * stale value.
 */
export function syncAudioClipTiming(
    clip: AudioClip,
    prefer: 'duration' | 'end' = 'duration',
): AudioClip {
    const start = finiteOr(clip.start_ms, 0);
    const duration = positiveOrNull(clip.duration_ms);
    const fromEnd = positiveOrNull(
        typeof clip.end_ms === 'number' ? clip.end_ms - start : null,
    );

    const resolved =
        prefer === 'end' ? (fromEnd ?? duration) : (duration ?? fromEnd);

    clip.duration_ms = resolved ?? FALLBACK_AUDIO_CLIP_DURATION_MS;
    clip.end_ms = start + clip.duration_ms;

    return clip;
}

function finiteOr(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value)
        ? value
        : fallback;
}

function positiveOrNull(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? value
        : null;
}

export function normalizeSubtitleTrack(
    track: SubtitleTrack,
    index = 0,
): SubtitleTrack {
    track.name ||= `Subtitles ${index + 1}`;
    track.entries ??= [];
    return track;
}
