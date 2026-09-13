import type {
    AudioTrack,
    BrandColorRole,
    BrandFontRole,
    BrandKit,
    Scene,
    SubtitleTrack,
    SubtitleWord,
    VideoTrack,
} from '@/types/editor';

/**
 * Recipes: templates as code.
 *
 * A recipe is a deterministic function from a script (beats) plus a brand kit
 * to a composition. The agent chooses the recipe and writes the beats; the
 * recipe guarantees the structure — safe-area layout, caption track, logo
 * placement, outro — so a production-ready shape does not depend on a model
 * getting a thousand JSON fields right. The output is an ordinary project
 * fragment: every element stays hand-editable afterwards.
 */

export type BeatKind = 'hook' | 'body' | 'cta';

export type RecipeBeat = {
    id: string;
    kind: BeatKind;
    /** On-screen headline; short. */
    headline: string;
    /** Optional secondary line. */
    sub?: string;
    /** Voiceover line, used for a caption when no word timings exist. */
    voiceover?: string;
    duration_ms: number;
    asset_id?: number | null;
    asset_type?: 'image' | 'video' | null;
    /** Word timings RELATIVE to the beat start. */
    words?: SubtitleWord[];
    /** TTS output for this beat, placed on the voice track at the beat start. */
    voice_asset_id?: number | null;
};

export type RecipeInput = {
    beats: RecipeBeat[];
    canvas: { width: number; height: number };
    fps: number;
    brand?: BrandKit | null;
    music_asset_id?: number | null;
    caption_preset?: string | null;
};

/** Which parts of a brand kit a recipe reads. */
export type RecipeSlots = {
    colors: BrandColorRole[];
    fonts: BrandFontRole[];
    logo: boolean;
    outro: boolean;
    watermark: boolean;
    voice: boolean;
    music: boolean;
};

export type RecipeOutput = {
    resolution_width: number;
    resolution_height: number;
    fps: number;
    scenes: Scene[];
    video_tracks: VideoTrack[];
    audio_tracks: AudioTrack[];
    subtitle_tracks: SubtitleTrack[];
};

export type RecipeId =
    | 'tiktok-hook-body-cta'
    | 'tiktok-listicle'
    | 'tiktok-talking-caption';

export type Recipe = {
    id: RecipeId;
    name: string;
    description: string;
    slots: RecipeSlots;
    build: (input: RecipeInput) => RecipeOutput;
};
