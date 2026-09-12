import type { Asset, Project } from '@/types';
import { formatFileSize } from './formatting';

/**
 * Everything the asset panel needs to say about an asset, derived from the
 * stored row alone. Pure on purpose: the panel renders these strings, the
 * details dialog renders the same ones, and the tests here are the only place
 * the formatting rules live.
 */

/** `mm:ss` for a library duration; `null` when the asset has no duration yet. */
export function formatAssetDuration(ms: number | null | undefined): string | null {
    if (!ms || ms <= 0) return null;

    const totalSeconds = Math.round(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatAssetDimensions(
    width: number | null | undefined,
    height: number | null | undefined,
): string | null {
    if (!width || !height) return null;

    return `${width}×${height}`;
}

/**
 * The nearest well-known aspect ratio, or the reduced fraction when the shape
 * is unusual. Snapping matters because 1080×1920 and 1088×1920 are the same
 * shape to a user but reduce to wildly different fractions.
 */
export function formatAspectRatio(
    width: number | null | undefined,
    height: number | null | undefined,
): string | null {
    if (!width || !height) return null;

    const ratio = width / height;
    const known: Array<[string, number]> = [
        ['16:9', 16 / 9],
        ['9:16', 9 / 16],
        ['4:3', 4 / 3],
        ['3:4', 3 / 4],
        ['1:1', 1],
        ['21:9', 21 / 9],
        ['4:5', 4 / 5],
        ['3:2', 3 / 2],
        ['2:3', 2 / 3],
    ];

    for (const [label, value] of known) {
        if (Math.abs(ratio - value) / value < 0.02) return label;
    }

    const divisor = greatestCommonDivisor(width, height);

    return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

function greatestCommonDivisor(a: number, b: number): number {
    return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

/** The vertical/horizontal/square hint shown next to the dimensions. */
export function orientationLabel(
    width: number | null | undefined,
    height: number | null | undefined,
): string | null {
    if (!width || !height) return null;
    if (Math.abs(width - height) / Math.max(width, height) < 0.02) return 'Square';

    return width > height ? 'Landscape' : 'Portrait';
}

/**
 * Generated assets are named after their prompt plus the file extension, and
 * uploads after a UUID. Neither reads well in a 110px tile, so drop the
 * extension and fall back to the type.
 */
export function assetDisplayName(asset: Asset): string {
    const name = (asset.name ?? '').trim().replace(/\.[a-z0-9]{1,5}$/i, '');
    if (name.length > 0) return name;

    return asset.type.charAt(0).toUpperCase() + asset.type.slice(1);
}

export function assetPrompt(asset: Asset): string | null {
    const prompt = asset.metadata?.prompt;

    return typeof prompt === 'string' && prompt.trim() !== '' ? prompt : null;
}

export function assetModel(asset: Asset): string | null {
    const model = asset.metadata?.model;

    return typeof model === 'string' && model.trim() !== '' ? model : null;
}

export function assetSourceLabel(asset: Asset): string {
    return asset.source === 'generated' ? 'AI generated' : 'Uploaded';
}

/** File extension in caps (`MP4`), from the name first and the mime as backup. */
export function assetFormatLabel(asset: Asset): string | null {
    const fromName = asset.name?.match(/\.([a-z0-9]{1,5})$/i)?.[1];
    if (fromName) return fromName.toUpperCase();

    const fromMime = asset.mime_type?.split('/')[1];

    return fromMime ? fromMime.toUpperCase() : null;
}

/** Short relative age: `Just now`, `12m ago`, `3h ago`, `5d ago`, else a date. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
    const then = new Date(iso);
    if (Number.isNaN(then.getTime())) return '';

    const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

    return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export type AssetInfoRow = {
    label: string;
    value: string;
};

/** The label/value rows shown in the tooltip and the details dialog. */
export function assetInfoRows(asset: Asset, now: Date = new Date()): AssetInfoRow[] {
    const rows: AssetInfoRow[] = [];
    const duration = formatAssetDuration(asset.duration_ms);
    const dimensions = formatAssetDimensions(asset.width, asset.height);
    const ratio = formatAspectRatio(asset.width, asset.height);
    const format = assetFormatLabel(asset);

    if (duration) rows.push({ label: 'Duration', value: duration });
    if (dimensions) {
        rows.push({
            label: 'Dimensions',
            value: ratio ? `${dimensions} (${ratio})` : dimensions,
        });
    }
    if (format) rows.push({ label: 'Format', value: format });
    if (asset.size_bytes) rows.push({ label: 'Size', value: formatFileSize(asset.size_bytes) });
    rows.push({ label: 'Source', value: assetSourceLabel(asset) });

    const model = assetModel(asset);
    if (model) rows.push({ label: 'Model', value: model });
    if (asset.created_at) {
        rows.push({ label: 'Added', value: formatRelativeTime(asset.created_at, now) });
    }

    return rows;
}

/**
 * How many places on the timeline use this asset — scene layers, overlay
 * clips and audio clips alike. Shown before a delete so nobody removes the
 * source of a clip they can still see on screen.
 */
export function countAssetUsages(project: Project | null, assetId: number): number {
    if (!project) return 0;

    const usesAsset = (item: unknown): boolean =>
        (item as { asset_id?: number }).asset_id === assetId;

    let count = 0;

    for (const scene of project.scenes ?? []) {
        count += (scene.layers ?? []).filter(usesAsset).length;
    }
    for (const track of project.video_tracks ?? []) {
        count += (track.clips ?? []).filter(usesAsset).length;
    }
    for (const track of project.audio_tracks ?? []) {
        count += (track.clips ?? []).filter(usesAsset).length;
    }

    return count;
}
