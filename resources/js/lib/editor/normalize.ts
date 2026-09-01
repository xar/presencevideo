import type {
    AudioTrack,
    Layer,
    Project,
    Scene,
    SubtitleTrack,
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
export function normalizeProject<T extends Project>(project: T): T {
    const canvas = { width: project.resolution_width, height: project.resolution_height };
    project.scenes = (project.scenes ?? []).map((scene) => normalizeScene(scene, canvas));
    project.video_tracks = (project.video_tracks ?? []).map((track) => normalizeVideoTrack(track, canvas));
    project.audio_tracks = (project.audio_tracks ?? []).map(normalizeAudioTrack);
    project.subtitle_tracks = (project.subtitle_tracks ?? []).map(normalizeSubtitleTrack);

    return project;
}

export type CanvasSize = { width: number; height: number };

const DEFAULT_CANVAS: CanvasSize = { width: 1920, height: 1080 };

export function normalizeScene(scene: Scene, canvas: CanvasSize = DEFAULT_CANVAS): Scene {
    scene.layers = (scene.layers ?? []).map((layer) => normalizeElement(layer, canvas));
    return scene;
}

/**
 * Shared defaults for anything rendered on the canvas (scene layers and
 * overlay clips). Legacy elements may lack a `type` (always video) or the
 * required text/shape fields the render assumes.
 */
export function normalizeElement<T extends Layer>(element: T, canvas: CanvasSize = DEFAULT_CANVAS): T {
    const raw = element as Partial<Layer> & Record<string, unknown>;
    raw.type ??= 'video';
    raw.x ??= 0;
    raw.y ??= 0;
    raw.width ??= Math.round(canvas.width / 4);
    raw.height ??= Math.round(canvas.height / 4);
    raw.z_index ??= 0;

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

export function normalizeVideoTrack(track: VideoTrack, canvas: CanvasSize = DEFAULT_CANVAS): VideoTrack {
    track.clips = (track.clips ?? []).map((clip) => normalizeVideoClip(clip, canvas));
    return track;
}

export function normalizeVideoClip(clip: VideoClip, canvas: CanvasSize = DEFAULT_CANVAS): VideoClip {
    return normalizeElement(clip, canvas);
}

export function normalizeAudioTrack(track: AudioTrack): AudioTrack {
    track.clips ??= [];
    return track;
}

export function normalizeSubtitleTrack(track: SubtitleTrack): SubtitleTrack {
    track.entries ??= [];
    return track;
}
