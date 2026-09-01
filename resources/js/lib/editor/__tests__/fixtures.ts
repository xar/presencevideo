import type { Project, Scene, VideoClip, VideoTrack, AudioTrack, TextLayer } from '@/types';

let counter = 0;
export const id = (prefix = 'id'): string => `${prefix}-${++counter}`;

export function makeTextLayer(overrides: Partial<TextLayer> = {}): TextLayer {
    return {
        id: id('layer'),
        type: 'text',
        text: 'Hello',
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        z_index: 0,
        font_size: 24,
        font_color: '#ffffff',
        ...overrides,
    };
}

export function makeScene(overrides: Partial<Scene> = {}): Scene {
    return { id: id('scene'), duration_ms: 3000, layers: [], ...overrides };
}

export function makeVideoClip(overrides: Partial<VideoClip> = {}): VideoClip {
    return ({
        id: id('clip'),
        type: 'text',
        text: 'Overlay',
        start_ms: 0,
        duration_ms: 1000,
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        z_index: 0,
        ...overrides,
    }) as VideoClip;
}

export function makeVideoTrack(overrides: Partial<VideoTrack> = {}): VideoTrack {
    return { id: id('vtrack'), name: 'Video Track', visible: true, clips: [], ...overrides };
}

export function makeAudioTrack(overrides: Partial<AudioTrack> = {}): AudioTrack {
    return { id: id('atrack'), name: 'Audio Track', volume: 1, clips: [], ...overrides };
}

export function makeProject(overrides: Partial<Project> = {}): Project {
    return {
        id: 1,
        user_id: 1,
        name: 'Test',
        resolution_width: 1920,
        resolution_height: 1080,
        fps: 30,
        scenes: [makeScene()],
        audio_tracks: [],
        video_tracks: [makeVideoTrack()],
        subtitle_tracks: [],
        status: 'draft',
        created_at: '',
        updated_at: '',
        assets: [],
        ...overrides,
    };
}
