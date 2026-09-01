import { describe, expect, it } from 'vitest';
import type { Project } from '@/types';
import { normalizeElement, normalizeProject } from '../normalize';
import { makeProject } from './fixtures';

describe('normalizeProject', () => {
    it('fills every nested list that a payload may omit', () => {
        const raw = {
            ...makeProject(),
            scenes: [{ id: 's1', duration_ms: 1000 }],
            video_tracks: [{ id: 'v1', name: 'Overlay' }],
            audio_tracks: [{ id: 'a1', name: 'Music', volume: 1 }],
            subtitle_tracks: [{ id: 't1', name: 'Subs', enabled: true, style: {} }],
        } as unknown as Project;

        const project = normalizeProject(raw);

        expect(project.scenes[0].layers).toEqual([]);
        expect(project.video_tracks[0].clips).toEqual([]);
        expect(project.audio_tracks[0].clips).toEqual([]);
        expect(project.subtitle_tracks[0].entries).toEqual([]);
    });

    it('defaults missing top-level lists and legacy clip types', () => {
        const raw = {
            ...makeProject(),
            scenes: undefined,
            audio_tracks: undefined,
            subtitle_tracks: undefined,
            video_tracks: [{ id: 'v1', name: 'Overlay', clips: [{ id: 'c1', asset_id: 4, start_ms: 0, duration_ms: 100 }] }],
        } as unknown as Project;

        const project = normalizeProject(raw);

        expect(project.scenes).toEqual([]);
        expect(project.audio_tracks).toEqual([]);
        expect(project.subtitle_tracks).toEqual([]);
        expect(project.video_tracks[0].clips[0].type).toBe('video');
    });

    it('keeps existing data intact and preserves identity', () => {
        const project = makeProject();
        const scene = project.scenes[0];

        const result = normalizeProject(project);

        expect(result).toBe(project);
        expect(result.scenes[0]).toBe(scene);
    });

    it('fills element defaults for legacy and partial elements', () => {
        const legacy = normalizeElement({ id: 'a', asset_id: 1, x: 0, y: 0, width: 1, height: 1 } as never);
        expect(legacy).toMatchObject({ type: 'video', z_index: 0 });

        const text = normalizeElement({ id: 'b', type: 'text', x: 0, y: 0, width: 1, height: 1, z_index: 2 } as never);
        expect(text).toMatchObject({ text: '', font_size: 48, font_color: '#ffffff', z_index: 2 });

        const shape = normalizeElement({ id: 'c', type: 'shape', x: 0, y: 0, width: 1, height: 1, z_index: 0 } as never);
        expect(shape).toMatchObject({ shape: 'rectangle', fill_color: '#ffffff' });
    });
});
