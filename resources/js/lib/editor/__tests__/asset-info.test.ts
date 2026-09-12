import { describe, expect, it } from 'vitest';
import type { Asset } from '@/types';
import {
    assetDisplayName,
    assetFormatLabel,
    assetInfoRows,
    assetModel,
    assetPrompt,
    countAssetUsages,
    formatAspectRatio,
    formatAssetDimensions,
    formatAssetDuration,
    formatRelativeTime,
    orientationLabel,
} from '../asset-info';
import { makeProject, makeScene, makeVideoClip, makeVideoTrack } from './fixtures';

function makeAsset(overrides: Partial<Asset> = {}): Asset {
    return {
        id: 1, user_id: 1, project_id: 1, type: 'video', source: 'upload', name: 'clip.mp4',
        path: 'p', disk: 'local', mime_type: 'video/mp4', size_bytes: 2 * 1024 * 1024,
        duration_ms: 10_125, width: 1080, height: 1920, thumbnail_path: null, metadata: {},
        created_at: '2026-09-12T10:00:00Z', updated_at: '2026-09-12T10:00:00Z',
        ...overrides,
    };
}

describe('formatAssetDuration', () => {
    it('renders mm:ss with a zero-padded seconds field', () => {
        expect(formatAssetDuration(10_125)).toBe('0:10');
        expect(formatAssetDuration(65_000)).toBe('1:05');
        expect(formatAssetDuration(600_000)).toBe('10:00');
    });

    it('has nothing to say about an unprobed asset', () => {
        expect(formatAssetDuration(null)).toBeNull();
        expect(formatAssetDuration(0)).toBeNull();
    });
});

describe('formatAspectRatio', () => {
    it('snaps near-misses onto the well-known ratio', () => {
        expect(formatAspectRatio(1080, 1920)).toBe('9:16');
        expect(formatAspectRatio(1088, 1920)).toBe('9:16');
        expect(formatAspectRatio(1920, 1080)).toBe('16:9');
        expect(formatAspectRatio(512, 512)).toBe('1:1');
    });

    it('reduces an unusual shape instead of inventing a label', () => {
        expect(formatAspectRatio(1000, 300)).toBe('10:3');
    });

    it('is null without both dimensions', () => {
        expect(formatAspectRatio(1080, null)).toBeNull();
    });
});

describe('dimension helpers', () => {
    it('formats dimensions and orientation', () => {
        expect(formatAssetDimensions(1080, 1920)).toBe('1080×1920');
        expect(orientationLabel(1080, 1920)).toBe('Portrait');
        expect(orientationLabel(1920, 1080)).toBe('Landscape');
        expect(orientationLabel(512, 512)).toBe('Square');
    });
});

describe('naming', () => {
    it('drops the extension and falls back to the type', () => {
        expect(assetDisplayName(makeAsset({ name: 'A drone shot.mp4' }))).toBe('A drone shot');
        expect(assetDisplayName(makeAsset({ name: '' }))).toBe('Video');
    });

    it('reads the format from the name, then the mime type', () => {
        expect(assetFormatLabel(makeAsset({ name: 'clip.mp4' }))).toBe('MP4');
        expect(assetFormatLabel(makeAsset({ name: 'clip', mime_type: 'audio/mpeg' }))).toBe('MPEG');
    });

    it('surfaces the generation prompt and model when present', () => {
        const generated = makeAsset({ metadata: { prompt: 'a drone shot', model: 'fal/flux' } });

        expect(assetPrompt(generated)).toBe('a drone shot');
        expect(assetModel(generated)).toBe('fal/flux');
        expect(assetPrompt(makeAsset())).toBeNull();
    });
});

describe('formatRelativeTime', () => {
    const now = new Date('2026-09-12T12:00:00Z');

    it('shortens recent times and dates out older ones', () => {
        expect(formatRelativeTime('2026-09-12T11:59:30Z', now)).toBe('Just now');
        expect(formatRelativeTime('2026-09-12T11:30:00Z', now)).toBe('30m ago');
        expect(formatRelativeTime('2026-09-12T09:00:00Z', now)).toBe('3h ago');
        expect(formatRelativeTime('2026-09-09T12:00:00Z', now)).toBe('3d ago');
        expect(formatRelativeTime('2026-01-01T12:00:00Z', now)).not.toContain('ago');
    });
});

describe('assetInfoRows', () => {
    it('lists only the facts the asset actually has', () => {
        const rows = assetInfoRows(makeAsset(), new Date('2026-09-12T12:00:00Z'));

        expect(rows).toEqual([
            { label: 'Duration', value: '0:10' },
            { label: 'Dimensions', value: '1080×1920 (9:16)' },
            { label: 'Format', value: 'MP4' },
            { label: 'Size', value: '2.0 MB' },
            { label: 'Source', value: 'Uploaded' },
            { label: 'Added', value: '2h ago' },
        ]);
    });

    it('names the model for a generated asset and skips unknown media facts', () => {
        const rows = assetInfoRows(
            makeAsset({
                type: 'audio', source: 'generated', name: 'voice.mp3', duration_ms: null,
                width: null, height: null, metadata: { model: 'fal/kokoro' },
            }),
            new Date('2026-09-12T12:00:00Z'),
        );

        expect(rows.map((row) => row.label)).toEqual(['Format', 'Size', 'Source', 'Model', 'Added']);
        expect(rows).toContainEqual({ label: 'Source', value: 'AI generated' });
    });
});

describe('countAssetUsages', () => {
    it('counts scene layers, overlay clips and audio clips alike', () => {
        const scene = makeScene({
            layers: [{
                id: 'l1', type: 'image', asset_id: 7, x: 0, y: 0, width: 10, height: 10, z_index: 0,
            }],
        });
        const project = makeProject({
            scenes: [scene],
            video_tracks: [makeVideoTrack({ clips: [makeVideoClip({ asset_id: 7 }), makeVideoClip({ asset_id: 8 })] })],
            audio_tracks: [{
                id: 'a1', name: 'Audio', volume: 1,
                clips: [{ id: 'c1', asset_id: 7, start_ms: 0, duration_ms: 1000, volume: 1 }],
            }],
        });

        expect(countAssetUsages(project, 7)).toBe(3);
        expect(countAssetUsages(project, 8)).toBe(1);
        expect(countAssetUsages(project, 99)).toBe(0);
        expect(countAssetUsages(null, 7)).toBe(0);
    });
});
