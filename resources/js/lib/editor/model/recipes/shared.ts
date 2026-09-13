import type {
    AudioClip,
    AudioTrack,
    BrandKit,
    ImageLayer,
    Layer,
    Scene,
    ShapeLayer,
    SubtitleEntry,
    SubtitleTrack,
    TextLayer,
    VideoClip,
    VideoLayer,
} from '@/types/editor';
import { CAPTION_PRESETS } from '../../caption-presets';
import { brandToken } from '../brand';
import type { KeyframeTracks } from '../keyframes';
import { applyMotionPreset } from '../motion-presets';
import type { MotionPresetId } from '../motion-presets';
import type { RecipeBeat, RecipeInput, RecipeOutput } from './types';

/**
 * Layout helpers shared by every recipe.
 *
 * All geometry is derived from the canvas so a recipe built for 1080x1920
 * also lays out correctly at 720x1280. The SAFE AREA is the complement of the
 * TikTok safe zones in `lint-profiles.ts`: x in [0, 0.86), y in [0.08, 0.82).
 * Every text and logo a recipe places must fit inside it, and the recipe
 * tests prove it by linting the output.
 */
export const SAFE_AREA = {
    left: 0.06,
    right: 0.82,
    top: 0.12,
    bottom: 0.8,
} as const;

export type Canvas = { width: number; height: number };

export type Palette = {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
    captionHighlight: string;
    display: string;
    body: string;
    caption: string;
};

/** Brand tokens when a kit is present, sensible literals otherwise. */
export function palette(brand: BrandKit | null | undefined): Palette {
    if (brand) {
        return {
            primary: brandToken('primary'),
            secondary: brandToken('secondary'),
            accent: brandToken('accent'),
            background: brandToken('background'),
            text: brandToken('text'),
            captionHighlight: brandToken('caption_highlight'),
            display: brandToken('display'),
            body: brandToken('body'),
            caption: brandToken('caption'),
        };
    }

    return {
        primary: '#ffffff',
        secondary: '#e5e7eb',
        accent: '#facc15',
        background: '#000000',
        text: '#ffffff',
        captionHighlight: '#facc15',
        display: 'Arial, sans-serif',
        body: 'Arial, sans-serif',
        caption: 'Arial, sans-serif',
    };
}

export function px(fraction: number, size: number): number {
    return Math.round(fraction * size);
}

/** Absolute start of each beat, in order. */
export function beatStarts(beats: readonly RecipeBeat[]): number[] {
    const starts: number[] = [];
    let cursor = 0;
    for (const beat of beats) {
        starts.push(cursor);
        cursor += Math.max(0, Math.round(beat.duration_ms));
    }
    return starts;
}

export function totalDuration(beats: readonly RecipeBeat[]): number {
    return beats.reduce(
        (total, beat) => total + Math.max(0, Math.round(beat.duration_ms)),
        0,
    );
}

function motion(
    id: MotionPresetId,
    element: Pick<Layer, 'x' | 'y' | 'width' | 'height'>,
    durationMs: number,
    canvas: Canvas,
): KeyframeTracks {
    return applyMotionPreset(undefined, id, {
        durationMs,
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
    });
}

/** Full-bleed media covering the canvas, with a slow push on stills. */
export function mediaLayer(
    beat: RecipeBeat,
    canvas: Canvas,
    zIndex = 0,
): VideoLayer | ImageLayer | null {
    if (typeof beat.asset_id !== 'number') {
        return null;
    }

    const box = { x: 0, y: 0, width: canvas.width, height: canvas.height };
    const type = beat.asset_type === 'video' ? 'video' : 'image';

    const layer = {
        id: `${beat.id}:media`,
        type,
        asset_id: beat.asset_id,
        ...box,
        z_index: zIndex,
        fit: 'cover' as const,
    };

    if (type === 'image') {
        return {
            ...layer,
            type: 'image',
            keyframes: motion('ken-burns-in', box, beat.duration_ms, canvas),
        };
    }

    return { ...layer, type: 'video', muted: false };
}

export type TextSpec = {
    id: string;
    text: string;
    /** Fractions of the canvas. */
    x: number;
    y: number;
    width: number;
    height: number;
    /** Fraction of canvas HEIGHT. */
    fontFraction: number;
    color: string;
    fontFamily: string;
    zIndex: number;
    align?: 'left' | 'center' | 'right';
    bold?: boolean;
    strokeColor?: string;
    strokeWidth?: number;
    backgroundColor?: string;
    motion?: MotionPresetId;
    durationMs: number;
};

export function textLayer(spec: TextSpec, canvas: Canvas): TextLayer {
    const box = {
        x: px(spec.x, canvas.width),
        y: px(spec.y, canvas.height),
        width: px(spec.width, canvas.width),
        height: px(spec.height, canvas.height),
    };

    const layer: TextLayer = {
        id: spec.id,
        type: 'text',
        text: spec.text,
        ...box,
        z_index: spec.zIndex,
        font_size: px(spec.fontFraction, canvas.height),
        font_color: spec.color,
        font_family: spec.fontFamily,
        font_weight: spec.bold === false ? 'normal' : 'bold',
        text_align: spec.align ?? 'center',
        stroke_color: spec.strokeColor ?? '#000000',
        stroke_width: spec.strokeWidth ?? Math.max(2, px(0.003, canvas.height)),
    };

    if (spec.backgroundColor) {
        layer.background_color = spec.backgroundColor;
        layer.padding = px(0.012, canvas.height);
    }

    if (spec.motion) {
        layer.keyframes = motion(spec.motion, box, spec.durationMs, canvas);
    }

    return layer;
}

export function shapeLayer(
    id: string,
    shape: ShapeLayer['shape'],
    box: { x: number; y: number; width: number; height: number },
    fill: string,
    zIndex: number,
    extra: Partial<ShapeLayer> = {},
): ShapeLayer {
    return {
        id,
        type: 'shape',
        shape,
        ...box,
        z_index: zIndex,
        fill_color: fill,
        ...extra,
    };
}

/**
 * Brand logo mark, bottom-left of the safe area, for the whole video.
 *
 * Placed on an overlay track rather than in every scene so it survives scene
 * edits and reads as one element in the timeline.
 */
export function logoClip(
    brand: BrandKit | null | undefined,
    canvas: Canvas,
    durationMs: number,
): VideoClip | null {
    const assetId =
        brand?.logos?.mark ??
        brand?.logos?.full ??
        brand?.logos?.light ??
        brand?.logos?.dark ??
        null;
    if (typeof assetId !== 'number') {
        return null;
    }

    const width = px(0.12, canvas.width);
    const height = width;

    return {
        id: 'brand:logo',
        type: 'image',
        asset_id: assetId,
        x: px(SAFE_AREA.left, canvas.width),
        y: px(SAFE_AREA.bottom, canvas.height) - height,
        width,
        height,
        z_index: 50,
        fit: 'contain',
        opacity: 0.95,
        brand_role: 'logo',
        start_ms: 0,
        duration_ms: durationMs,
    };
}

/** Outro scene from the brand kit, when it has one. */
export function outroScene(
    brand: BrandKit | null | undefined,
    canvas: Canvas,
    p: Palette,
    durationMs = 3000,
): Scene | null {
    const assetId = brand?.outro_asset_id;
    if (typeof assetId !== 'number') {
        return null;
    }

    return {
        id: 'brand:outro',
        name: 'Outro',
        duration_ms: durationMs,
        background_color: p.background,
        layers: [
            {
                id: 'brand:outro:media',
                type: 'video',
                asset_id: assetId,
                x: 0,
                y: 0,
                width: canvas.width,
                height: canvas.height,
                z_index: 0,
                fit: 'cover',
                brand_role: 'outro',
            } satisfies VideoLayer,
        ],
    };
}

/** One caption entry per beat, word timings shifted to absolute time. */
export function captionTrack(
    input: RecipeInput,
    starts: readonly number[],
    p: Palette,
): SubtitleTrack | null {
    const entries: SubtitleEntry[] = [];

    input.beats.forEach((beat, index) => {
        const start = starts[index];
        const end = start + Math.max(0, Math.round(beat.duration_ms));
        const words = (beat.words ?? [])
            .filter((word) => typeof word.text === 'string' && word.text !== '')
            .map((word) => ({
                text: word.text,
                start_ms: start + Math.max(0, word.start_ms),
                end_ms: start + Math.max(0, word.end_ms),
            }));

        const text =
            words.length > 0
                ? words.map((word) => word.text).join(' ')
                : (beat.voiceover ?? '').trim();
        if (text === '') {
            return;
        }

        const entry: SubtitleEntry = {
            id: `${beat.id}:caption`,
            start_ms: start,
            end_ms:
                words.length > 0
                    ? Math.min(
                          end,
                          Math.max(...words.map((word) => word.end_ms)) + 150,
                      )
                    : end,
            text,
        };
        if (words.length > 0) {
            entry.words = words;
        }
        entries.push(entry);
    });

    if (entries.length === 0) {
        return null;
    }

    const presetId =
        input.caption_preset ?? input.brand?.caption_preset ?? 'bold-outline';
    const preset = CAPTION_PRESETS[presetId] ?? CAPTION_PRESETS['bold-outline'];
    const style = { ...preset.style };

    if (input.brand) {
        style.font_family = p.caption;
        style.highlight_color = p.captionHighlight;
    }

    return {
        id: 'recipe:captions',
        name: 'Captions',
        enabled: true,
        style,
        entries,
    };
}

export function audioTracks(
    input: RecipeInput,
    starts: readonly number[],
    durationMs: number,
): AudioTrack[] {
    const tracks: AudioTrack[] = [];

    const voiceClips: AudioClip[] = [];
    input.beats.forEach((beat, index) => {
        if (typeof beat.voice_asset_id !== 'number') {
            return;
        }
        voiceClips.push({
            id: `${beat.id}:voice`,
            asset_id: beat.voice_asset_id,
            start_ms: starts[index],
            duration_ms: Math.max(0, Math.round(beat.duration_ms)),
            volume: 1,
        });
    });

    if (voiceClips.length > 0) {
        tracks.push({
            id: 'recipe:voice',
            name: 'Voiceover',
            volume: 1,
            clips: voiceClips,
        });
    }

    const musicAssetId =
        input.music_asset_id ?? input.brand?.music?.asset_ids?.[0] ?? null;
    if (typeof musicAssetId === 'number' && durationMs > 0) {
        tracks.push({
            id: 'recipe:music',
            name: 'Music',
            volume: 1,
            clips: [
                {
                    id: 'recipe:music:clip',
                    asset_id: musicAssetId,
                    start_ms: 0,
                    duration_ms: durationMs,
                    volume: 0.25,
                    fade_in_ms: 500,
                    fade_out_ms: 1500,
                },
            ],
        });
    }

    return tracks;
}

/** Assemble the common tail of every recipe: overlays, captions, audio. */
export function assemble(
    input: RecipeInput,
    scenes: Scene[],
    starts: readonly number[],
    p: Palette,
    extraClips: VideoClip[] = [],
): RecipeOutput {
    const canvas = input.canvas;
    const outro = outroScene(input.brand, canvas, p);
    const allScenes = outro ? [...scenes, outro] : scenes;
    const duration = allScenes.reduce(
        (total, scene) => total + scene.duration_ms,
        0,
    );

    const clips: VideoClip[] = [...extraClips];
    const logo = logoClip(input.brand, canvas, totalDuration(input.beats));
    if (logo) {
        clips.push(logo);
    }

    const captions = captionTrack(input, starts, p);

    return {
        resolution_width: canvas.width,
        resolution_height: canvas.height,
        fps: input.fps,
        scenes: allScenes,
        video_tracks:
            clips.length > 0
                ? [
                      {
                          id: 'recipe:overlays',
                          name: 'Brand',
                          visible: true,
                          clips,
                      },
                  ]
                : [],
        audio_tracks: audioTracks(input, starts, duration),
        subtitle_tracks: captions ? [captions] : [],
    };
}
