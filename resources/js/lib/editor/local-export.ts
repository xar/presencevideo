import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_MEDIUM } from 'mediabunny';
import type { Layer, Project, Scene } from '@/types/editor';

export async function exportQuickPreview(project: Project, onProgress?: (progress: number) => void): Promise<Blob> {
    const canvas = new OffscreenCanvas(project.resolution_width, project.resolution_height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Canvas rendering is not available in this browser.');
    }

    const output = new Output({
        format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
        target: new BufferTarget(),
    });
    const source = new CanvasSource(canvas, {
        codec: 'avc',
        bitrate: QUALITY_MEDIUM,
    });

    output.addVideoTrack(source);
    await output.start();

    const images = new Map<number, ImageBitmap>();
    const imageAssets = (project.assets ?? []).filter((asset) => asset.type === 'image' || asset.type === 'video');

    await Promise.all(imageAssets.map(async (asset) => {
        const url = asset.thumbnail_url ?? asset.url;
        if (!url) return;

        const response = await fetch(url);
        const blob = await response.blob();
        images.set(asset.id, await createImageBitmap(blob));
    }));

    const totalFrames = Math.max(1, Math.ceil(totalDuration(project) / 1000 * project.fps));
    let frameIndex = 0;
    let timestamp = 0;

    for (const scene of project.scenes) {
        const sceneFrames = Math.max(1, Math.ceil(scene.duration_ms / 1000 * project.fps));
        for (let frame = 0; frame < sceneFrames; frame++) {
            drawScene(ctx, project, scene, images);
            await source.add(timestamp, 1 / project.fps);
            timestamp += 1 / project.fps;
            frameIndex++;
            onProgress?.(Math.round((frameIndex / totalFrames) * 100));
        }
    }

    await output.finalize();

    images.forEach((image) => image.close());

    if (!output.target.buffer) {
        throw new Error('Browser export did not produce a video file.');
    }

    return new Blob([output.target.buffer], { type: 'video/mp4' });
}

function drawScene(
    ctx: OffscreenCanvasRenderingContext2D,
    project: Project,
    scene: Scene,
    images: Map<number, ImageBitmap>,
): void {
    ctx.fillStyle = scene.background_color ?? '#000000';
    ctx.fillRect(0, 0, project.resolution_width, project.resolution_height);

    [...scene.layers]
        .sort((a, b) => a.z_index - b.z_index)
        .forEach((layer) => drawLayer(ctx, layer, images));
}

function drawLayer(ctx: OffscreenCanvasRenderingContext2D, layer: Layer, images: Map<number, ImageBitmap>): void {
    ctx.save();
    ctx.globalAlpha = layer.opacity ?? 1;

    if ((layer.type === 'image' || layer.type === 'video') && layer.asset_id) {
        const image = images.get(layer.asset_id);
        if (image) {
            ctx.drawImage(image, layer.x, layer.y, layer.width, layer.height);
        }
    }

    if (layer.type === 'text') {
        ctx.fillStyle = layer.font_color ?? '#ffffff';
        ctx.font = `${layer.font_weight ?? 'normal'} ${layer.font_size ?? 48}px ${layer.font_family ?? 'sans-serif'}`;
        ctx.textBaseline = 'top';
        ctx.fillText(layer.text ?? '', layer.x, layer.y, layer.width);
    }

    ctx.restore();
}

function totalDuration(project: Project): number {
    return project.scenes.reduce((duration, scene) => duration + scene.duration_ms, 0);
}
