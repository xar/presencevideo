import type { Project, Scene, Layer, AudioTrack, AudioClip, VideoTrack, VideoClip, Asset } from '@/types';
import { router } from '@inertiajs/svelte';
import { v4 as uuid } from 'uuid';

export type ProjectStore = {
    project: Project | null;
    isDirty: boolean;
    isSaving: boolean;
    setProject: (project: Project) => void;
    syncAssets: (assets: Asset[]) => void;
    updateProject: (updates: Partial<Project>) => void;
    addScene: (scene?: Partial<Scene>) => Scene;
    updateScene: (sceneId: string, updates: Partial<Scene>) => void;
    deleteScene: (sceneId: string) => void;
    reorderScenes: (fromIndex: number, toIndex: number) => void;
    addLayer: (sceneId: string, layer: Partial<Layer>) => Layer;
    updateLayer: (sceneId: string, layerId: string, updates: Partial<Layer>) => void;
    deleteLayer: (sceneId: string, layerId: string) => void;
    addAudioTrack: (track?: Partial<AudioTrack>) => AudioTrack;
    updateAudioTrack: (trackId: string, updates: Partial<AudioTrack>) => void;
    deleteAudioTrack: (trackId: string) => void;
    addAudioClip: (trackId: string, clip: Partial<AudioClip>) => AudioClip;
    updateAudioClip: (trackId: string, clipId: string, updates: Partial<AudioClip>) => void;
    deleteAudioClip: (trackId: string, clipId: string) => void;
    addVideoTrack: (track?: Partial<VideoTrack>) => VideoTrack;
    updateVideoTrack: (trackId: string, updates: Partial<VideoTrack>) => void;
    deleteVideoTrack: (trackId: string) => void;
    addVideoClip: (trackId: string, clip: Partial<VideoClip>) => VideoClip;
    updateVideoClip: (trackId: string, clipId: string, updates: Partial<VideoClip>) => void;
    deleteVideoClip: (trackId: string, clipId: string) => void;
    save: () => Promise<void>;
    markDirty: () => void;
};

let project = $state<Project | null>(null);
let isDirty = $state(false);
let isSaving = $state(false);

function setProject(p: Project): void {
    project = p;
    isDirty = false;
}

function syncAssets(assets: Asset[]): void {
    if (!project) return;
    // Only update if assets have actually changed (new assets added)
    if (project.assets?.length !== assets.length) {
        project = { ...project, assets };
    }
}

function updateProject(updates: Partial<Project>): void {
    if (!project) return;
    project = { ...project, ...updates };
    isDirty = true;
}

function addScene(sceneData?: Partial<Scene>): Scene {
    if (!project) throw new Error('No project loaded');

    const scene: Scene = {
        id: uuid(),
        name: `Scene ${project.scenes.length + 1}`,
        duration_ms: 5000,
        layers: [],
        background_color: '#000000',
        ...sceneData,
    };

    project = {
        ...project,
        scenes: [...project.scenes, scene],
    };
    isDirty = true;

    return scene;
}

function updateScene(sceneId: string, updates: Partial<Scene>): void {
    if (!project) return;

    project = {
        ...project,
        scenes: project.scenes.map((scene) =>
            scene.id === sceneId ? { ...scene, ...updates } : scene
        ),
    };
    isDirty = true;
}

function deleteScene(sceneId: string): void {
    if (!project) return;

    project = {
        ...project,
        scenes: project.scenes.filter((scene) => scene.id !== sceneId),
    };
    isDirty = true;
}

function reorderScenes(fromIndex: number, toIndex: number): void {
    if (!project) return;

    const scenes = [...project.scenes];
    const [removed] = scenes.splice(fromIndex, 1);
    scenes.splice(toIndex, 0, removed);

    project = { ...project, scenes };
    isDirty = true;
}

function addLayer(sceneId: string, layerData: Partial<Layer>): Layer {
    if (!project) throw new Error('No project loaded');

    const scene = project.scenes.find((s) => s.id === sceneId);
    if (!scene) throw new Error('Scene not found');

    const layer = {
        id: uuid(),
        x: 0,
        y: 0,
        width: project.resolution_width,
        height: project.resolution_height,
        z_index: scene.layers.length,
        ...layerData,
    } as Layer;

    updateScene(sceneId, {
        layers: [...scene.layers, layer],
    });

    return layer;
}

function updateLayer(sceneId: string, layerId: string, updates: Partial<Layer>): void {
    if (!project) return;

    const scene = project.scenes.find((s) => s.id === sceneId);
    if (!scene) return;

    updateScene(sceneId, {
        layers: scene.layers.map((layer) =>
            layer.id === layerId ? ({ ...layer, ...updates } as Layer) : layer
        ),
    });
}

function deleteLayer(sceneId: string, layerId: string): void {
    if (!project) return;

    const scene = project.scenes.find((s) => s.id === sceneId);
    if (!scene) return;

    updateScene(sceneId, {
        layers: scene.layers.filter((layer) => layer.id !== layerId),
    });
}

function addAudioTrack(trackData?: Partial<AudioTrack>): AudioTrack {
    if (!project) throw new Error('No project loaded');

    const track: AudioTrack = {
        id: uuid(),
        name: `Track ${project.audio_tracks.length + 1}`,
        volume: 1.0,
        clips: [],
        ...trackData,
    };

    project = {
        ...project,
        audio_tracks: [...project.audio_tracks, track],
    };
    isDirty = true;

    return track;
}

function updateAudioTrack(trackId: string, updates: Partial<AudioTrack>): void {
    if (!project) return;

    project = {
        ...project,
        audio_tracks: project.audio_tracks.map((track) =>
            track.id === trackId ? { ...track, ...updates } : track
        ),
    };
    isDirty = true;
}

function deleteAudioTrack(trackId: string): void {
    if (!project) return;

    project = {
        ...project,
        audio_tracks: project.audio_tracks.filter((track) => track.id !== trackId),
    };
    isDirty = true;
}

function addAudioClip(trackId: string, clipData: Partial<AudioClip>): AudioClip {
    if (!project) throw new Error('No project loaded');

    const track = project.audio_tracks.find((t) => t.id === trackId);
    if (!track) throw new Error('Track not found');

    const clip: AudioClip = {
        id: uuid(),
        asset_id: 0,
        start_ms: 0,
        duration_ms: 5000,
        volume: 1.0,
        ...clipData,
    };

    updateAudioTrack(trackId, {
        clips: [...track.clips, clip],
    });

    return clip;
}

function updateAudioClip(trackId: string, clipId: string, updates: Partial<AudioClip>): void {
    if (!project) return;

    const track = project.audio_tracks.find((t) => t.id === trackId);
    if (!track) return;

    updateAudioTrack(trackId, {
        clips: track.clips.map((clip) =>
            clip.id === clipId ? { ...clip, ...updates } : clip
        ),
    });
}

function deleteAudioClip(trackId: string, clipId: string): void {
    if (!project) return;

    const track = project.audio_tracks.find((t) => t.id === trackId);
    if (!track) return;

    updateAudioTrack(trackId, {
        clips: track.clips.filter((clip) => clip.id !== clipId),
    });
}

function addVideoTrack(trackData?: Partial<VideoTrack>): VideoTrack {
    if (!project) throw new Error('No project loaded');

    const track: VideoTrack = {
        id: uuid(),
        name: `Video Track ${project.video_tracks.length + 1}`,
        visible: true,
        clips: [],
        ...trackData,
    };

    project = {
        ...project,
        video_tracks: [...project.video_tracks, track],
    };
    isDirty = true;

    return track;
}

function updateVideoTrack(trackId: string, updates: Partial<VideoTrack>): void {
    if (!project) return;

    project = {
        ...project,
        video_tracks: project.video_tracks.map((track) =>
            track.id === trackId ? { ...track, ...updates } : track
        ),
    };
    isDirty = true;
}

function deleteVideoTrack(trackId: string): void {
    if (!project) return;

    project = {
        ...project,
        video_tracks: project.video_tracks.filter((track) => track.id !== trackId),
    };
    isDirty = true;
}

function addVideoClip(trackId: string, clipData: Partial<VideoClip>): VideoClip {
    if (!project) throw new Error('No project loaded');

    const track = project.video_tracks.find((t) => t.id === trackId);
    if (!track) throw new Error('Track not found');

    const clip: VideoClip = {
        id: uuid(),
        asset_id: 0,
        start_ms: 0,
        duration_ms: 5000,
        x: 0,
        y: 0,
        width: Math.round(project.resolution_width * 0.25),
        height: Math.round(project.resolution_height * 0.25),
        z_index: track.clips.length,
        ...clipData,
    };

    updateVideoTrack(trackId, {
        clips: [...track.clips, clip],
    });

    return clip;
}

function updateVideoClip(trackId: string, clipId: string, updates: Partial<VideoClip>): void {
    if (!project) return;

    const track = project.video_tracks.find((t) => t.id === trackId);
    if (!track) return;

    updateVideoTrack(trackId, {
        clips: track.clips.map((clip) =>
            clip.id === clipId ? { ...clip, ...updates } : clip
        ),
    });
}

function deleteVideoClip(trackId: string, clipId: string): void {
    if (!project) return;

    const track = project.video_tracks.find((t) => t.id === trackId);
    if (!track) return;

    updateVideoTrack(trackId, {
        clips: track.clips.filter((clip) => clip.id !== clipId),
    });
}

async function save(): Promise<void> {
    if (!project || !isDirty || isSaving) return;

    isSaving = true;

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
            },
            {
                preserveScroll: true,
                onSuccess: () => {
                    isDirty = false;
                    isSaving = false;
                    resolve();
                },
                onError: (errors) => {
                    isSaving = false;
                    reject(errors);
                },
            }
        );
    });
}

function markDirty(): void {
    isDirty = true;
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
        addAudioTrack,
        updateAudioTrack,
        deleteAudioTrack,
        addAudioClip,
        updateAudioClip,
        deleteAudioClip,
        addVideoTrack,
        updateVideoTrack,
        deleteVideoTrack,
        addVideoClip,
        updateVideoClip,
        deleteVideoClip,
        save,
        markDirty,
    };
}

export const projectStore = createProjectStore();
