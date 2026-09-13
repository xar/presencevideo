import type { KeyframeTracks } from '@/lib/editor/model/keyframes';

// Project Types
export type ProjectStatus = 'draft' | 'rendering' | 'completed' | 'failed';

export type Project = {
    id: number;
    user_id: number;
    name: string;
    resolution_width: number;
    resolution_height: number;
    fps: number;
    scenes: Scene[];
    audio_tracks: AudioTrack[];
    video_tracks: VideoTrack[];
    subtitle_tracks: SubtitleTrack[];
    status: ProjectStatus;
    /** The brand kit this project is styled with; `brand.*` tokens resolve against it. */
    brand_kit_id?: number | null;
    /** Loaded alongside the project so token resolution never needs a fetch. */
    brand_kit?: BrandKit | null;
    created_at: string;
    updated_at: string;
    assets?: Asset[];
};

// Brand Kit Types
/**
 * Colour roles a brand kit defines. Elements reference them as `brand.<role>`
 * tokens (e.g. `font_color: "brand.primary"`) so swapping the kit restyles the
 * whole project; resolution happens in `resolveFrame()`, never in storage.
 */
export type BrandColorRole =
    | 'primary'
    | 'secondary'
    | 'accent'
    | 'background'
    | 'text'
    | 'caption_highlight';

export type BrandFontRole = 'display' | 'body' | 'caption';

export type BrandColors = Partial<Record<BrandColorRole, string>>;

/** CSS font-family stacks per role; `brand.display` etc. resolve to these. */
export type BrandFonts = Partial<Record<BrandFontRole, string>>;

export type BrandLogos = {
    /** Full wordmark. */
    full?: number | null;
    /** Compact mark for small placements. */
    mark?: number | null;
    /** Variants for light / dark backgrounds. */
    light?: number | null;
    dark?: number | null;
};

export type BrandWatermark = {
    asset_id?: number | null;
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    /** 0..1 */
    opacity?: number;
    /** Fraction of canvas width, 0..1. */
    size?: number;
};

export type BrandVoice = {
    model_id?: string | null;
    voice_id?: string | null;
};

export type BrandMusic = {
    mood?: string | null;
    asset_ids?: number[];
};

export type BrandKit = {
    id: number;
    user_id: number;
    name: string;
    /** The site the kit was derived from; seeds the AI intake prompt. */
    website_url: string | null;
    colors: BrandColors;
    fonts: BrandFonts;
    logos: BrandLogos;
    watermark: BrandWatermark | null;
    intro_asset_id: number | null;
    outro_asset_id: number | null;
    voice: BrandVoice | null;
    music: BrandMusic | null;
    caption_preset: string | null;
    motion_preset: string | null;
    tone: string | null;
    created_at: string;
    updated_at: string;
};

/** Prefix every brand token carries, e.g. `brand.primary`, `brand.display`. */
export const BRAND_TOKEN_PREFIX = 'brand.';

/**
 * What a brand-aware element is FOR. Lint uses it to check that a logo is
 * present, large enough and outside the platform safe zone; the compositor
 * ignores it.
 */
export type BrandRole = 'logo' | 'watermark' | 'intro' | 'outro';

// Transition Types
/** Every value maps 1:1 to an ffmpeg `xfade` transition name. */
export type TransitionType =
    | 'fade'
    | 'fadeblack'
    | 'fadewhite'
    | 'slideleft'
    | 'slideright'
    | 'slideup'
    | 'slidedown'
    | 'wipeleft'
    | 'wiperight'
    | 'circleopen'
    | 'circleclose'
    | 'dissolve';

export type SceneTransition = {
    type: TransitionType;
    duration_ms: number;
};

// Scene Types
/**
 * A named, ordered chunk of the timeline.
 *
 * @deprecated as STORAGE for elements. The unified model treats a scene as a
 * derived VIEW over the timeline (`SceneView` in `lib/editor/model/timeline.ts`):
 * a name, an absolute start and a duration. `layers` is still the persisted
 * home of scene-scoped elements — and will remain readable forever for
 * backwards compatibility — but nothing should reason about element timing by
 * walking scenes. Use `buildTimeline(project)` and work with `TimelineElement`,
 * which carries absolute `start_ms`/`end_ms` regardless of where the element is
 * stored.
 */
export type Scene = {
    id: string;
    name?: string;
    /** @deprecated Read `SceneView.durationMs` from `buildTimeline()` instead. */
    duration_ms: number;
    /** @deprecated Read `Timeline.elements` instead; see the note on `Scene`. */
    layers: Layer[];
    background_color?: string;
    thumbnail_url?: string;
    /** Transition into the NEXT scene; ignored on the last scene. */
    transition?: SceneTransition | null;
    /**
     * Absolute start written by older payloads. Never read: scene starts are
     * derived (prefix sum, minus transition overlap) so they cannot go stale.
     */
    start_ms?: number;
};

// Layer Types
export type LayerType = 'video' | 'image' | 'text' | 'shape';

export type BaseLayer = {
    id: string;
    type: LayerType;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
    opacity?: number;
    z_index: number;
    /**
     * Animated overrides for the static properties above, keyed by property
     * path. Keyframe times are ELEMENT-LOCAL so animation travels with the
     * element when it is moved or retimed.
     */
    keyframes?: KeyframeTracks;
    /** Marks an element placed on behalf of the brand kit (logo, watermark…). */
    brand_role?: BrandRole;
};

/**
 * How media fills its box when the aspect ratios disagree.
 *
 * Declared here (rather than imported from `model/frame.ts`) so the persisted
 * types stay free of a dependency on the render model; the two declarations are
 * identical by construction.
 */
export type MediaFit = 'cover' | 'contain' | 'fill';

export type TextAlign = 'left' | 'center' | 'right';

/**
 * Colour adjustments stored on ffmpeg's own `eq` scales so the render and the
 * inspector agree: brightness -1..1 (0 neutral), contrast 0..2 (1 neutral),
 * saturation 0..2 (1 neutral).
 */
export type LayerAdjustments = {
    brightness?: number;
    contrast?: number;
    saturation?: number;
};

export type VideoLayer = BaseLayer & {
    type: 'video';
    asset_id: number;
    /** How the source fills the element box; 'cover' when absent. */
    fit?: MediaFit;
    trim_start_ms?: number;
    trim_end_ms?: number;
    /** Constant playback speed multiplier, 0.25–4 (default 1). */
    speed?: number;
    /** Playback volume of the clip's own audio, 0–1 (default 1). */
    volume?: number;
    /** Silences the clip's own audio in both the preview and the render. */
    muted?: boolean;
    adjustments?: LayerAdjustments;
};

export type ImageLayer = BaseLayer & {
    type: 'image';
    asset_id: number;
    /** How the source fills the element box; 'cover' when absent. */
    fit?: MediaFit;
    adjustments?: LayerAdjustments;
};

export type TextLayer = BaseLayer & {
    type: 'text';
    text: string;
    font_family?: string;
    font_size: number;
    font_color: string;
    font_weight?: 'normal' | 'bold';
    text_align?: TextAlign;
    background_color?: string;
    padding?: number;
    stroke_color?: string;
    stroke_width?: number;
};

/** `line` is just a thin bar; users make it thin and rotate it. No arrow heads. */
export type ShapeKind = 'rectangle' | 'ellipse' | 'line';

export type ShapeLayer = BaseLayer & {
    type: 'shape';
    shape: ShapeKind;
    /** Hex fill, or '' / 'transparent' for no fill (outline only). */
    fill_color: string;
    border_color?: string;
    /** Border thickness in project pixels; 0 (or missing) means no border. */
    border_width?: number;
    /** Corner rounding in project pixels; rectangles only. */
    corner_radius?: number;
};

export type Layer = VideoLayer | ImageLayer | TextLayer | ShapeLayer;

/**
 * The one element type of the unified timeline.
 *
 * A scene layer and an overlay clip were always the same thing rendered by the
 * same code; the only difference was where their timing came from. A
 * `TimelineElement` is that thing with its timing resolved: ABSOLUTE
 * `start_ms`/`end_ms` on a track, independent of any scene.
 *
 * Scene layers acquire these fields in `normalizeProject()` (derived from the
 * enclosing scene) so legacy rows load with no data migration;
 * `buildTimeline()` re-derives them from the scene for as long as scenes remain
 * the storage primitive, so a stored value can never go stale against a scene
 * whose duration changed.
 */
export type TimelineElement = Layer & {
    /** Absolute start on the project timeline, inclusive. */
    start_ms: number;
    /** Absolute end on the project timeline, EXCLUSIVE. */
    end_ms: number;
    /** Owning track; the scene id for elements still stored inside a scene. */
    track_id: string;
};

// Audio Types
export type AudioTrack = {
    id: string;
    name: string;
    volume: number;
    muted?: boolean;
    clips: AudioClip[];
};

export type AudioClip = {
    id: string;
    asset_id: number;
    start_ms: number;
    duration_ms: number;
    /**
     * Exclusive end, mirroring `start_ms + duration_ms`.
     *
     * Audio clips are read through `duration_ms` everywhere, but the AI
     * composition tool writes every element as `start_ms`/`end_ms`. Both are
     * kept in step by `syncAudioClipTiming()`; never write one alone.
     */
    end_ms?: number;
    trim_start_ms?: number;
    trim_end_ms?: number;
    volume: number;
    fade_in_ms?: number;
    fade_out_ms?: number;
    keyframes?: KeyframeTracks;
};

// Video Track Types
export type VideoTrack = {
    id: string;
    name: string;
    visible?: boolean;
    clips: VideoClip[];
};

/** Clip types are exactly the layer types; kept as an alias for readability. */
export type VideoClipType = LayerType;

export type ClipTiming = {
    /** Absolute position on the project timeline. */
    start_ms: number;
    duration_ms: number;
};

/**
 * An overlay clip is a layer placed on the global timeline instead of inside a
 * scene: same rendering, same inspector, plus timing. `z_index` orders clips
 * within their track.
 *
 * @deprecated as a distinct concept. This is a `TimelineElement` whose timing
 * happens to be stored as `start_ms` + `duration_ms`; `buildTimeline()` lifts
 * both clips and scene layers into the same `TimelineElement` list, and new
 * code should consume that rather than branching on clip-vs-layer.
 */
export type VideoClip = Layer & ClipTiming;

// Subtitle Types
export type SubtitleWord = {
    text: string;
    start_ms: number;
    end_ms: number;
};

export type SubtitleEntry = {
    id: string;
    start_ms: number;
    end_ms: number;
    text: string;
    words?: SubtitleWord[];
};

export type SubtitleStyle = {
    font_size: number;
    font_color: string;
    background_color: string;
    position: 'top' | 'bottom';
    preset?: string;
    font_family?: string;
    stroke_color?: string;
    stroke_width?: number;
    highlight_color?: string;
    text_transform?: 'none' | 'uppercase';
};

export type SubtitleTrack = {
    id: string;
    name: string;
    enabled: boolean;
    style: SubtitleStyle;
    entries: SubtitleEntry[];
};

// Asset Types
export type AssetType = 'video' | 'image' | 'audio';
export type AssetSource = 'upload' | 'generated';

export type Asset = {
    id: number;
    user_id: number;
    project_id: number | null;
    type: AssetType;
    source: AssetSource;
    name: string;
    path: string;
    disk: string;
    mime_type: string;
    size_bytes: number;
    duration_ms: number | null;
    width: number | null;
    height: number | null;
    thumbnail_path: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
    url?: string;
    thumbnail_url?: string;
};

// Generation Types
export type GenerationType =
    | 'text_to_image'
    | 'image_to_video'
    | 'text_to_video'
    | 'text_to_music'
    | 'text_to_speech'
    | 'text_to_sfx'
    | 'speech_to_text';

export type GenerationStatus =
    | 'pending'
    | 'processing'
    | 'completed'
    | 'failed';

export type Generation = {
    id: number;
    user_id: number;
    project_id: number;
    scene_id: string | null;
    step_index: number | null;
    type: GenerationType;
    provider: string;
    model: string;
    prompt: string;
    input_asset_id: number | null;
    output_asset_id: number | null;
    parameters: Record<string, unknown>;
    status: GenerationStatus;
    error_message: string | null;
    fal_request_id: string | null;
    alternatives: string[];
    created_at: string;
    updated_at: string;
    output_asset?: Asset;
};

// Render Types
export type RenderStatus =
    | 'queued'
    | 'processing'
    | 'compositing'
    | 'mixing'
    | 'completed'
    | 'failed';

export type Render = {
    id: number;
    project_id: number;
    user_id: number;
    status: RenderStatus;
    progress: number;
    output_path: string | null;
    output_asset_id: number | null;
    error_message: string | null;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
    output_url?: string;
};

// Editor UI Types
export type Tool = 'select' | 'pan';

export type Selection = {
    type:
        | 'scene'
        | 'layer'
        | 'audio_clip'
        | 'video_clip'
        | 'audio_track'
        | 'video_track'
        | null;
    sceneId: string | null;
    layerId: string | null;
    audioTrackId: string | null;
    audioClipId: string | null;
    videoTrackId: string | null;
    videoClipId: string | null;
};

export type Viewport = {
    zoom: number;
    panX: number;
    panY: number;
};

// Pipeline Types
export type PipelineStep = {
    type: GenerationType;
    prompt: string;
    status: GenerationStatus;
    generation_id?: number;
    output_asset?: Asset;
};

// Model Configuration Types
export type ParameterType =
    | 'select'
    | 'slider'
    | 'checkbox'
    | 'text'
    | 'textarea'
    | 'audio_upload'
    | 'number';

export type ParameterGroup = 'common' | 'advanced';

export type ParameterConfig = {
    type: ParameterType;
    label: string;
    options?: Record<string, string>;
    min?: number;
    max?: number;
    step?: number | string;
    group?: ParameterGroup;
};

export type ModelConfig = {
    key: string;
    id: string;
    name: string;
    description: string;
    thumbnail: string | null;
    playground_url: string;
    category: string;
    tags: string[];
    is_featured: boolean;
    is_new: boolean;
    is_catalog?: boolean; // True if loaded from fal.ai catalog
    parameters: Record<string, ParameterConfig>;
    defaults: Record<string, unknown>;
};

export type ModelsResponse = {
    models: Record<string, ModelConfig[]>;
};
