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
    created_at: string;
    updated_at: string;
    assets?: Asset[];
};

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
export type Scene = {
    id: string;
    name?: string;
    duration_ms: number;
    layers: Layer[];
    background_color?: string;
    thumbnail_url?: string;
    /** Transition into the NEXT scene; ignored on the last scene. */
    transition?: SceneTransition | null;
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
};

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
    start_time_ms?: number;
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
    adjustments?: LayerAdjustments;
};

export type TextLayer = BaseLayer & {
    type: 'text';
    text: string;
    font_family?: string;
    font_size: number;
    font_color: string;
    font_weight?: 'normal' | 'bold';
    text_align?: 'left' | 'center' | 'right';
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
    trim_start_ms?: number;
    volume: number;
    fade_in_ms?: number;
    fade_out_ms?: number;
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
    type: 'scene' | 'layer' | 'audio_clip' | 'video_clip' | 'audio_track' | 'video_track' | null;
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
