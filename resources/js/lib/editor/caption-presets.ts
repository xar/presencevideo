import type { SubtitleStyle } from '@/types';

export type CaptionPreset = {
    id: string;
    label: string;
    style: SubtitleStyle;
};

/**
 * Curated caption presets sized for 1080p output. `font_size` values map 1:1
 * to the ASS PlayRes (project resolution) on export, so tune them for 1080p.
 *
 * The shared default font is Arial (`Arial, sans-serif` in preview,
 * `Arial` Fontname in ASS) so preview and burn-in stay visually consistent.
 */
export const CAPTION_PRESETS: Record<string, CaptionPreset> = {
    classic: {
        id: 'classic',
        label: 'Classic',
        style: {
            font_size: 48,
            font_color: '#ffffff',
            background_color: '#00000099',
            position: 'bottom',
            preset: 'classic',
            font_family: 'Arial, sans-serif',
            stroke_color: '#000000',
            stroke_width: 0,
            text_transform: 'none',
        },
    },
    minimal: {
        id: 'minimal',
        label: 'Minimal',
        style: {
            font_size: 48,
            font_color: '#ffffff',
            background_color: 'transparent',
            position: 'bottom',
            preset: 'minimal',
            font_family: 'Arial, sans-serif',
            stroke_color: '#000000',
            stroke_width: 2,
            text_transform: 'none',
        },
    },
    'bold-outline': {
        id: 'bold-outline',
        label: 'Bold',
        style: {
            font_size: 60,
            font_color: '#ffffff',
            background_color: 'transparent',
            position: 'bottom',
            preset: 'bold-outline',
            font_family: 'Arial, sans-serif',
            stroke_color: '#000000',
            stroke_width: 6,
            text_transform: 'uppercase',
        },
    },
    karaoke: {
        id: 'karaoke',
        label: 'Karaoke',
        style: {
            font_size: 60,
            font_color: '#ffffff',
            background_color: 'transparent',
            position: 'bottom',
            preset: 'karaoke',
            font_family: 'Arial, sans-serif',
            stroke_color: '#000000',
            stroke_width: 6,
            highlight_color: '#FACC15',
            text_transform: 'uppercase',
        },
    },
    boxed: {
        id: 'boxed',
        label: 'Boxed',
        style: {
            font_size: 52,
            font_color: '#ffffff',
            background_color: '#111827ff',
            position: 'bottom',
            preset: 'boxed',
            font_family: 'Arial, sans-serif',
            stroke_color: '#000000',
            stroke_width: 0,
            text_transform: 'none',
        },
    },
    'yellow-bold': {
        id: 'yellow-bold',
        label: 'Pop',
        style: {
            font_size: 60,
            font_color: '#FACC15',
            background_color: 'transparent',
            position: 'bottom',
            preset: 'yellow-bold',
            font_family: 'Arial, sans-serif',
            stroke_color: '#000000',
            stroke_width: 6,
            highlight_color: '#ffffff',
            text_transform: 'uppercase',
        },
    },
};

/**
 * Apply a preset's style to an existing style, preserving the caller-controlled
 * `position`. Unknown preset ids return the original style unchanged.
 */
export function applyCaptionPreset(
    style: SubtitleStyle,
    presetId: string,
): SubtitleStyle {
    const preset = CAPTION_PRESETS[presetId];
    if (!preset) {
        return style;
    }

    return {
        ...preset.style,
        position: style.position,
    };
}
