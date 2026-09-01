import { router } from '@inertiajs/svelte';
import { v4 as uuid } from 'uuid';
import { clampSpeed } from '@/lib/editor/clip-effects';
import type {
    Project,
    Scene,
    Layer,
    AudioTrack,
    AudioClip,
    VideoTrack,
    VideoClip,
    SubtitleTrack,
    SubtitleEntry,
    Asset,
} from '@/types';
import { normalizeElement, normalizeProject } from './normalize';

/** Z-order operations available on a scene layer. */
export type LayerZMove = 'forward' | 'backward' | 'front' | 'back';

export type ProjectStore = {
    project: Project | null;
    isDirty: boolean;
    isSaving: boolean;
    lastSaveError: string | null;
    /** Increments on every mutation. Read it to re-run on any project edit. */
    editVersion: number;
    setProject: (project: Project) => void;
    syncAssets: (assets: Asset[]) => void;
    updateProject: (updates: Partial<Project>) => void;
    addScene: (scene?: Partial<Scene>) => Scene;
    updateScene: (sceneId: string, updates: Partial<Scene>) => void;
    deleteScene: (sceneId: string) => void;
    reorderScenes: (fromIndex: number, toIndex: number) => void;
    addLayer: (sceneId: string, layer: Partial<Layer>) => Layer;
    updateLayer: (
        sceneId: string,
        layerId: string,
        updates: Partial<Layer>,
    ) => void;
    deleteLayer: (sceneId: string, layerId: string) => void;
    reorderLayer: (
        sceneId: string,
        layerId: string,
        move: LayerZMove,
    ) => void;
    addAudioTrack: (track?: Partial<AudioTrack>) => AudioTrack;
    updateAudioTrack: (trackId: string, updates: Partial<AudioTrack>) => void;
    deleteAudioTrack: (trackId: string) => void;
    addAudioClip: (trackId: string, clip: Partial<AudioClip>) => AudioClip;
    updateAudioClip: (
        trackId: string,
        clipId: string,
        updates: Partial<AudioClip>,
    ) => void;
    deleteAudioClip: (trackId: string, clipId: string) => void;
    addVideoTrack: (track?: Partial<VideoTrack>) => VideoTrack;
    updateVideoTrack: (trackId: string, updates: Partial<VideoTrack>) => void;
    deleteVideoTrack: (trackId: string) => void;
    moveVideoTrack: (trackId: string, delta: -1 | 1) => void;
    moveAudioTrack: (trackId: string, delta: -1 | 1) => void;
    addVideoClip: (trackId: string, clip: Partial<VideoClip>) => VideoClip;
    updateVideoClip: (
        trackId: string,
        clipId: string,
        updates: Partial<VideoClip>,
    ) => void;
    deleteVideoClip: (trackId: string, clipId: string) => void;
    moveVideoClip: (
        fromTrackId: string,
        clipId: string,
        toTrackId: string,
    ) => boolean;
    splitVideoClip: (
        trackId: string,
        clipId: string,
        atMs: number,
    ) => VideoClip | null;
    splitAudioClip: (
        trackId: string,
        clipId: string,
        atMs: number,
    ) => AudioClip | null;
    addSubtitleTrack: (track?: Partial<SubtitleTrack>) => SubtitleTrack;
    updateSubtitleTrack: (
        trackId: string,
        updates: Partial<SubtitleTrack>,
    ) => void;
    deleteSubtitleTrack: (trackId: string) => void;
    addSubtitleEntry: (
        trackId: string,
        entry: Partial<SubtitleEntry>,
    ) => SubtitleEntry;
    updateSubtitleEntry: (
        trackId: string,
        entryId: string,
        updates: Partial<SubtitleEntry>,
    ) => void;
    deleteSubtitleEntry: (trackId: string, entryId: string) => void;
    save: () => Promise<void>;
    markDirty: () => void;
    dismissSaveError: () => void;
    onBeforeMutate: (callback: () => void) => void;
    onAfterMutate: (callback: () => void) => void;
};

let project = $state<Project | null>(null);
let isDirty = $state(false);
let isSaving = $state(false);
let lastSaveError = $state<string | null>(null);
let editVersion = $state(0);
let beforeMutateCallback: (() => void) | null = null;
const afterMutateCallbacks: Array<() => void> = [];
/** Guards against re-entrancy if the hook itself touches the store. */
let isNotifyingBeforeMutate = false;

/**
 * Notify the registered hook (history) that a mutation is about to happen.
 *
 * MUST be called at the top of every mutator, after its guard clauses but
 * before the first state change, so the listener can snapshot the *pre-edit*
 * state. `markDirty()` runs afterwards and only does dirty/version bookkeeping.
 *
 * No mutator in this file calls another mutator, so exactly one notification
 * fires per public call. Callers that perform several mutations as one logical
 * action wrap them in `historyStore.beginBatch()` / `endBatch()`, which
 * suppresses the intermediate pushes.
 */
function beforeMutate(): void {
    if (isNotifyingBeforeMutate) return;

    isNotifyingBeforeMutate = true;
    try {
        beforeMutateCallback?.();
    } finally {
        isNotifyingBeforeMutate = false;
    }
}

function setProject(p: Project): void {
    project = normalizeProject(p);
    isDirty = false;
}

/**
 * All mutators below edit the `$state` proxy in place rather than rebuilding
 * the project object. `$state` tracks every field as its own signal, so
 * assigning `layer.x = 10` invalidates only that leaf. Replacing the root
 * (`project = { ...project }`) instead invalidates every consumer of the store
 * on every edit, which is what made dragging re-render the whole editor.
 */

function syncAssets(assets: Asset[]): void {
    if (!project) return;
    // Compare by id:updated_at pairs to detect both additions and updates
    const currentKey = (project.assets ?? [])
        .map((a) => `${a.id}:${a.updated_at}`)
        .join(',');
    const newKey = assets.map((a) => `${a.id}:${a.updated_at}`).join(',');
    if (currentKey !== newKey) {
        project.assets = assets;
    }
}

function updateProject(updates: Partial<Project>): void {
    if (!project) return;

    beforeMutate();
    Object.assign(project, updates);
    markDirty();
}

function findScene(sceneId: string): Scene | undefined {
    return project?.scenes.find((scene) => scene.id === sceneId);
}

function findAudioTrack(trackId: string): AudioTrack | undefined {
    return project?.audio_tracks.find((track) => track.id === trackId);
}

function findVideoTrack(trackId: string): VideoTrack | undefined {
    return project?.video_tracks.find((track) => track.id === trackId);
}

function findSubtitleTrack(trackId: string): SubtitleTrack | undefined {
    return (project?.subtitle_tracks ?? []).find(
        (track) => track.id === trackId,
    );
}

function addScene(sceneData?: Partial<Scene>): Scene {
    if (!project) throw new Error('No project loaded');

    beforeMutate();

    const scene: Scene = {
        id: uuid(),
        name: `Scene ${project.scenes.length + 1}`,
        duration_ms: 5000,
        layers: [],
        background_color: '#000000',
        ...sceneData,
    };

    project.scenes.push(scene);
    markDirty();

    return scene;
}

function updateScene(sceneId: string, updates: Partial<Scene>): void {
    const scene = findScene(sceneId);
    if (!scene) return;

    beforeMutate();
    Object.assign(scene, updates);
    markDirty();
}

function deleteScene(sceneId: string): void {
    if (!project) return;

    const index = project.scenes.findIndex((scene) => scene.id === sceneId);
    if (index === -1) return;

    beforeMutate();
    project.scenes.splice(index, 1);
    markDirty();
}

function reorderScenes(fromIndex: number, toIndex: number): void {
    if (!project) return;
    if (fromIndex < 0 || fromIndex >= project.scenes.length) return;
    if (fromIndex === toIndex) return;

    beforeMutate();

    const [removed] = project.scenes.splice(fromIndex, 1);
    project.scenes.splice(toIndex, 0, removed);
    markDirty();
}

function addLayer(sceneId: string, layerData: Partial<Layer>): Layer {
    if (!project) throw new Error('No project loaded');

    const scene = findScene(sceneId);
    if (!scene) throw new Error('Scene not found');

    beforeMutate();

    const maxZ = scene.layers.length > 0
        ? Math.max(...scene.layers.map((l) => l.z_index))
        : -1;

    const layer = {
        id: uuid(),
        x: 0,
        y: 0,
        width: project.resolution_width,
        height: project.resolution_height,
        z_index: maxZ + 1,
        ...layerData,
    } as Layer;

    scene.layers.push(layer);
    markDirty();

    return layer;
}

function updateLayer(
    sceneId: string,
    layerId: string,
    updates: Partial<Layer>,
): void {
    const scene = findScene(sceneId);
    if (!scene) return;

    const layer = scene.layers.find((l) => l.id === layerId);
    if (!layer) return;

    beforeMutate();
    Object.assign(layer, updates);
    markDirty();
}

function deleteLayer(sceneId: string, layerId: string): void {
    const scene = findScene(sceneId);
    if (!scene) return;

    const index = scene.layers.findIndex((layer) => layer.id === layerId);
    if (index === -1) return;

    beforeMutate();
    scene.layers.splice(index, 1);
    markDirty();
}

/**
 * Move a layer within its scene's stacking order and re-normalise every
 * `z_index` in the scene to a dense 0..n-1 range so the values stay stable.
 */
function reorderLayer(
    sceneId: string,
    layerId: string,
    move: LayerZMove,
): void {
    const scene = findScene(sceneId);
    if (!scene) return;

    const ordered = [...scene.layers].sort((a, b) => a.z_index - b.z_index);
    const from = ordered.findIndex((layer) => layer.id === layerId);
    if (from === -1) return;

    const to = {
        forward: Math.min(ordered.length - 1, from + 1),
        backward: Math.max(0, from - 1),
        front: ordered.length - 1,
        back: 0,
    }[move];

    if (to === from) return;

    beforeMutate();

    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);

    ordered.forEach((layer, index) => {
        if (layer.z_index !== index) {
            layer.z_index = index;
        }
    });

    markDirty();
}

function addAudioTrack(trackData?: Partial<AudioTrack>): AudioTrack {
    if (!project) throw new Error('No project loaded');

    beforeMutate();

    const track: AudioTrack = {
        id: uuid(),
        name: `Track ${project.audio_tracks.length + 1}`,
        volume: 1.0,
        clips: [],
        ...trackData,
    };

    project.audio_tracks.push(track);
    markDirty();

    return track;
}

function updateAudioTrack(trackId: string, updates: Partial<AudioTrack>): void {
    const track = findAudioTrack(trackId);
    if (!track) return;

    beforeMutate();
    Object.assign(track, updates);
    markDirty();
}

function deleteAudioTrack(trackId: string): void {
    if (!project) return;

    const index = project.audio_tracks.findIndex(
        (track) => track.id === trackId,
    );
    if (index === -1) return;

    beforeMutate();
    project.audio_tracks.splice(index, 1);
    markDirty();
}

function addAudioClip(
    trackId: string,
    clipData: Partial<AudioClip>,
): AudioClip {
    const track = findAudioTrack(trackId);
    if (!track) throw new Error('Track not found');

    beforeMutate();

    const clip: AudioClip = {
        id: uuid(),
        asset_id: 0,
        start_ms: 0,
        duration_ms: 5000,
        volume: 1.0,
        ...clipData,
    };

    track.clips.push(clip);
    markDirty();

    return clip;
}

function updateAudioClip(
    trackId: string,
    clipId: string,
    updates: Partial<AudioClip>,
): void {
    const track = findAudioTrack(trackId);
    if (!track) return;

    const clip = track.clips.find((c) => c.id === clipId);
    if (!clip) return;

    beforeMutate();
    Object.assign(clip, updates);
    markDirty();
}

function deleteAudioClip(trackId: string, clipId: string): void {
    const track = findAudioTrack(trackId);
    if (!track) return;

    const index = track.clips.findIndex((clip) => clip.id === clipId);
    if (index === -1) return;

    beforeMutate();
    track.clips.splice(index, 1);
    markDirty();
}

function addVideoTrack(trackData?: Partial<VideoTrack>): VideoTrack {
    if (!project) throw new Error('No project loaded');

    beforeMutate();

    const track: VideoTrack = {
        id: uuid(),
        name: `Video Track ${project.video_tracks.length + 1}`,
        visible: true,
        clips: [],
        ...trackData,
    };

    project.video_tracks.push(track);
    markDirty();

    return track;
}

function updateVideoTrack(trackId: string, updates: Partial<VideoTrack>): void {
    const track = findVideoTrack(trackId);
    if (!track) return;

    beforeMutate();
    Object.assign(track, updates);
    markDirty();
}

function deleteVideoTrack(trackId: string): void {
    if (!project) return;

    const index = project.video_tracks.findIndex(
        (track) => track.id === trackId,
    );
    if (index === -1) return;

    beforeMutate();
    project.video_tracks.splice(index, 1);
    markDirty();
}

/** Swap a track with its neighbour; `delta` is -1 (up) or +1 (down). */
function moveVideoTrack(trackId: string, delta: -1 | 1): void {
    if (!project) return;
    moveWithin(project.video_tracks, trackId, delta);
}

function moveAudioTrack(trackId: string, delta: -1 | 1): void {
    if (!project) return;
    moveWithin(project.audio_tracks, trackId, delta);
}

function moveWithin<T extends { id: string }>(list: T[], id: string, delta: -1 | 1): void {
    const from = list.findIndex((item) => item.id === id);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= list.length) return;

    beforeMutate();
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
    markDirty();
}

function addVideoClip(
    trackId: string,
    clipData: Partial<VideoClip>,
): VideoClip {
    if (!project) throw new Error('No project loaded');

    const track = findVideoTrack(trackId);
    if (!track) throw new Error('Track not found');

    beforeMutate();

    const clip = normalizeElement({
        id: uuid(),
        start_ms: 0,
        duration_ms: 5000,
        x: 0,
        y: 0,
        width: Math.round(project.resolution_width * 0.25),
        height: Math.round(project.resolution_height * 0.25),
        z_index: track.clips.length,
        ...clipData,
    } as VideoClip);

    track.clips.push(clip);
    markDirty();

    return clip;
}

function updateVideoClip(
    trackId: string,
    clipId: string,
    updates: Partial<VideoClip>,
): void {
    const track = findVideoTrack(trackId);
    if (!track) return;

    const clip = track.clips.find((c) => c.id === clipId);
    if (!clip) return;

    beforeMutate();
    Object.assign(clip, updates);
    markDirty();
}

function deleteVideoClip(trackId: string, clipId: string): void {
    const track = findVideoTrack(trackId);
    if (!track) return;

    const index = track.clips.findIndex((clip) => clip.id === clipId);
    if (index === -1) return;

    beforeMutate();
    track.clips.splice(index, 1);
    markDirty();
}

/**
 * Move a clip to another video track, keeping its timing and placement. The
 * clip keeps its id so selection can follow it. Returns false when either
 * track or the clip cannot be found; moving onto the same track is a no-op.
 */
function moveVideoClip(
    fromTrackId: string,
    clipId: string,
    toTrackId: string,
): boolean {
    if (fromTrackId === toTrackId) return false;

    const fromTrack = findVideoTrack(fromTrackId);
    const toTrack = findVideoTrack(toTrackId);
    if (!fromTrack || !toTrack) return false;

    const index = fromTrack.clips.findIndex((clip) => clip.id === clipId);
    if (index === -1) return false;

    beforeMutate();
    const [clip] = fromTrack.clips.splice(index, 1);
    clip.z_index = toTrack.clips.length;
    toTrack.clips.push(clip);
    markDirty();

    return true;
}

/**
 * Split a video clip at an absolute timeline position (ms). The left clip keeps
 * the original id; the right clip receives a new id and, for media clips, an
 * adjusted trim_start_ms so its content stays continuous. Text clips split
 * without trim adjustment. Returns the new right-hand clip, or null if atMs is
 * not strictly inside the clip.
 */
function splitVideoClip(
    trackId: string,
    clipId: string,
    atMs: number,
): VideoClip | null {
    const track = findVideoTrack(trackId);
    if (!track) return null;

    const index = track.clips.findIndex((c) => c.id === clipId);
    if (index === -1) return null;

    const clip = track.clips[index];
    const end = clip.start_ms + clip.duration_ms;
    if (atMs <= clip.start_ms || atMs >= end) return null;

    const leftDuration = atMs - clip.start_ms;
    const rightDuration = end - atMs;

    beforeMutate();

    const snapshot = structuredClone($state.snapshot(clip)) as VideoClip;
    const rightClip: VideoClip = {
        ...snapshot,
        id: uuid(),
        start_ms: atMs,
        duration_ms: rightDuration,
    };

    if (clip.type === 'video' && rightClip.type === 'video') {
        // The left half consumes `leftDuration` of timeline, which is
        // `leftDuration * speed` of source footage.
        rightClip.trim_start_ms =
            (clip.trim_start_ms ?? 0) + leftDuration * clampSpeed(clip.speed);
    }

    clip.duration_ms = leftDuration;
    track.clips.splice(index + 1, 0, rightClip);
    markDirty();

    return rightClip;
}

/**
 * Split an audio clip at an absolute timeline position (ms). The left clip keeps
 * the original id; the right clip receives a new id and an adjusted
 * trim_start_ms so its content stays continuous. Returns the new right-hand
 * clip, or null if atMs is not strictly inside the clip.
 */
function splitAudioClip(
    trackId: string,
    clipId: string,
    atMs: number,
): AudioClip | null {
    const track = findAudioTrack(trackId);
    if (!track) return null;

    const index = track.clips.findIndex((c) => c.id === clipId);
    if (index === -1) return null;

    const clip = track.clips[index];
    const end = clip.start_ms + clip.duration_ms;
    if (atMs <= clip.start_ms || atMs >= end) return null;

    const leftDuration = atMs - clip.start_ms;
    const rightDuration = end - atMs;

    beforeMutate();

    const snapshot = structuredClone($state.snapshot(clip)) as AudioClip;
    const rightClip: AudioClip = {
        ...snapshot,
        id: uuid(),
        start_ms: atMs,
        duration_ms: rightDuration,
        trim_start_ms: (clip.trim_start_ms ?? 0) + leftDuration,
    };

    clip.duration_ms = leftDuration;
    track.clips.splice(index + 1, 0, rightClip);
    markDirty();

    return rightClip;
}

function addSubtitleTrack(trackData?: Partial<SubtitleTrack>): SubtitleTrack {
    if (!project) throw new Error('No project loaded');

    beforeMutate();

    const track: SubtitleTrack = {
        id: uuid(),
        name: `Subtitles ${(project.subtitle_tracks?.length ?? 0) + 1}`,
        enabled: true,
        style: {
            font_size: 48,
            font_color: '#ffffff',
            background_color: '#00000080',
            position: 'bottom',
        },
        entries: [],
        ...trackData,
    };

    if (!project.subtitle_tracks) {
        project.subtitle_tracks = [];
    }
    project.subtitle_tracks.push(track);
    markDirty();

    return track;
}

function updateSubtitleTrack(
    trackId: string,
    updates: Partial<SubtitleTrack>,
): void {
    const track = findSubtitleTrack(trackId);
    if (!track) return;

    beforeMutate();
    Object.assign(track, updates);
    markDirty();
}

function deleteSubtitleTrack(trackId: string): void {
    if (!project?.subtitle_tracks) return;

    const index = project.subtitle_tracks.findIndex(
        (track) => track.id === trackId,
    );
    if (index === -1) return;

    beforeMutate();
    project.subtitle_tracks.splice(index, 1);
    markDirty();
}

function addSubtitleEntry(
    trackId: string,
    entryData: Partial<SubtitleEntry>,
): SubtitleEntry {
    const track = findSubtitleTrack(trackId);
    if (!track) throw new Error('Subtitle track not found');

    beforeMutate();

    const entry: SubtitleEntry = {
        id: uuid(),
        start_ms: 0,
        end_ms: 3000,
        text: '',
        ...entryData,
    };

    track.entries.push(entry);
    markDirty();

    return entry;
}

function updateSubtitleEntry(
    trackId: string,
    entryId: string,
    updates: Partial<SubtitleEntry>,
): void {
    const track = findSubtitleTrack(trackId);
    if (!track) return;

    const entry = track.entries.find((e) => e.id === entryId);
    if (!entry) return;

    beforeMutate();
    Object.assign(entry, updates);
    markDirty();
}

function deleteSubtitleEntry(trackId: string, entryId: string): void {
    const track = findSubtitleTrack(trackId);
    if (!track) return;

    const index = track.entries.findIndex((entry) => entry.id === entryId);
    if (index === -1) return;

    beforeMutate();
    track.entries.splice(index, 1);
    markDirty();
}

async function save(): Promise<void> {
    if (!project || !isDirty || isSaving) return;

    isSaving = true;
    lastSaveError = null;
    const versionAtSaveStart = editVersion;

    return new Promise((resolve, reject) => {
        router.put(
            `/editor/projects/${project!.id}`,
            {
                name: project!.name,
                resolution_width: project!.resolution_width,
                resolution_height: project!.resolution_height,
                fps: project!.fps,
                scenes: project!.scenes,
                audio_tracks: project!.audio_tracks,
                video_tracks: project!.video_tracks,
                subtitle_tracks: project!.subtitle_tracks,
            },
            {
                preserveScroll: true,
                onSuccess: () => {
                    // Only clear dirty if no edits happened during save
                    if (editVersion === versionAtSaveStart) {
                        isDirty = false;
                    }
                    isSaving = false;
                    resolve();
                },
                onError: (errors) => {
                    isSaving = false;
                    const msg = Object.values(errors).flat().join(', ');
                    lastSaveError = msg || 'Save failed';
                    reject(errors);
                },
            },
        );
    });
}

function dismissSaveError(): void {
    lastSaveError = null;
}

/**
 * Dirty/version bookkeeping plus the after-mutate hooks (selection
 * reconciliation). Runs at the end of every mutator, including undo/redo.
 */
function markDirty(): void {
    isDirty = true;
    editVersion++;

    for (const callback of afterMutateCallbacks) {
        callback();
    }
}

function onBeforeMutate(callback: () => void): void {
    beforeMutateCallback = callback;
}

function onAfterMutate(callback: () => void): void {
    afterMutateCallbacks.push(callback);
}

export function createProjectStore(): ProjectStore {
    return {
        get project() {
            return project;
        },
        get isDirty() {
            return isDirty;
        },
        get isSaving() {
            return isSaving;
        },
        get lastSaveError() {
            return lastSaveError;
        },
        get editVersion() {
            return editVersion;
        },
        setProject,
        syncAssets,
        updateProject,
        addScene,
        updateScene,
        deleteScene,
        reorderScenes,
        addLayer,
        updateLayer,
        deleteLayer,
        reorderLayer,
        addAudioTrack,
        updateAudioTrack,
        deleteAudioTrack,
        addAudioClip,
        updateAudioClip,
        deleteAudioClip,
        addVideoTrack,
        updateVideoTrack,
        deleteVideoTrack,
        moveVideoTrack,
        moveAudioTrack,
        addVideoClip,
        updateVideoClip,
        deleteVideoClip,
        moveVideoClip,
        splitVideoClip,
        splitAudioClip,
        addSubtitleTrack,
        updateSubtitleTrack,
        deleteSubtitleTrack,
        addSubtitleEntry,
        updateSubtitleEntry,
        deleteSubtitleEntry,
        save,
        markDirty,
        dismissSaveError,
        onBeforeMutate,
        onAfterMutate,
    };
}

export const projectStore = createProjectStore();
