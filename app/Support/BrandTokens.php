<?php

namespace App\Support;

use App\Models\BrandKit;

/**
 * Resolve `brand.<role>` tokens against a brand kit.
 *
 * Pure array-in, array-out. This is the PHP twin of
 * `resources/js/lib/editor/model/brand.ts`: same field list, same fallbacks.
 * Tokens are resolved at RENDER time only — never written back into the
 * stored project — so swapping a project's kit restyles it. Non-token values
 * pass through untouched, including non-canonical ones already in production
 * data.
 */
class BrandTokens
{
    public const PREFIX = 'brand.';

    public const FALLBACK_COLOR = '#ffffff';

    public const FALLBACK_FONT = 'Arial, sans-serif';

    /**
     * Colour fields on a canvas element that may carry a token.
     *
     * @var array<int, string>
     */
    public const ELEMENT_COLOR_FIELDS = ['font_color', 'background_color', 'stroke_color', 'fill_color', 'border_color'];

    /**
     * @var array<int, string>
     */
    public const SUBTITLE_COLOR_FIELDS = ['font_color', 'background_color', 'stroke_color', 'highlight_color'];

    public static function isToken(mixed $value): bool
    {
        return is_string($value) && str_starts_with($value, self::PREFIX) && strlen($value) > strlen(self::PREFIX);
    }

    /**
     * @param  array<string, mixed>|null  $colors
     */
    public static function resolveColor(mixed $value, ?array $colors): mixed
    {
        if (! self::isToken($value)) {
            return $value;
        }

        $resolved = $colors[substr($value, strlen(self::PREFIX))] ?? null;

        return is_string($resolved) && trim($resolved) !== '' ? $resolved : self::FALLBACK_COLOR;
    }

    /**
     * @param  array<string, mixed>|null  $fonts
     */
    public static function resolveFont(mixed $value, ?array $fonts): mixed
    {
        if (! self::isToken($value)) {
            return $value;
        }

        $resolved = $fonts[substr($value, strlen(self::PREFIX))] ?? null;

        return is_string($resolved) && trim($resolved) !== '' ? $resolved : self::FALLBACK_FONT;
    }

    /**
     * Resolve every token on a scene: its background and each layer.
     *
     * @param  array<string, mixed>  $scene
     * @return array<string, mixed>
     */
    public static function resolveScene(array $scene, ?BrandKit $kit): array
    {
        [$colors, $fonts] = self::maps($kit);

        if (array_key_exists('background_color', $scene)) {
            $scene['background_color'] = self::resolveColor($scene['background_color'], $colors);
        }

        if (is_array($scene['layers'] ?? null)) {
            $scene['layers'] = array_map(
                fn (mixed $layer): mixed => is_array($layer) ? self::resolveElement($layer, $colors, $fonts) : $layer,
                $scene['layers'],
            );
        }

        return $scene;
    }

    /**
     * @param  array<int, array<string, mixed>>  $tracks
     * @return array<int, array<string, mixed>>
     */
    public static function resolveVideoTracks(array $tracks, ?BrandKit $kit): array
    {
        [$colors, $fonts] = self::maps($kit);

        foreach ($tracks as $index => $track) {
            if (! is_array($track) || ! is_array($track['clips'] ?? null)) {
                continue;
            }

            $tracks[$index]['clips'] = array_map(
                fn (mixed $clip): mixed => is_array($clip) ? self::resolveElement($clip, $colors, $fonts) : $clip,
                $track['clips'],
            );
        }

        return $tracks;
    }

    /**
     * @param  array<int, array<string, mixed>>  $tracks
     * @return array<int, array<string, mixed>>
     */
    public static function resolveSubtitleTracks(array $tracks, ?BrandKit $kit): array
    {
        [$colors, $fonts] = self::maps($kit);

        foreach ($tracks as $index => $track) {
            if (! is_array($track) || ! is_array($track['style'] ?? null)) {
                continue;
            }

            $style = $track['style'];

            foreach (self::SUBTITLE_COLOR_FIELDS as $field) {
                if (array_key_exists($field, $style)) {
                    $style[$field] = self::resolveColor($style[$field], $colors);
                }
            }

            if (array_key_exists('font_family', $style)) {
                $style['font_family'] = self::resolveFont($style['font_family'], $fonts);
            }

            $tracks[$index]['style'] = $style;
        }

        return $tracks;
    }

    /**
     * Resolve every token in a project's serialised lists.
     *
     * @param  array<string, mixed>  $project
     * @return array<string, mixed>
     */
    public static function resolveProjectArrays(array $project, ?BrandKit $kit): array
    {
        if (is_array($project['scenes'] ?? null)) {
            $project['scenes'] = array_map(
                fn (mixed $scene): mixed => is_array($scene) ? self::resolveScene($scene, $kit) : $scene,
                $project['scenes'],
            );
        }

        if (is_array($project['video_tracks'] ?? null)) {
            $project['video_tracks'] = self::resolveVideoTracks($project['video_tracks'], $kit);
        }

        if (is_array($project['subtitle_tracks'] ?? null)) {
            $project['subtitle_tracks'] = self::resolveSubtitleTracks($project['subtitle_tracks'], $kit);
        }

        return $project;
    }

    /**
     * @param  array<string, mixed>  $element
     * @param  array<string, mixed>|null  $colors
     * @param  array<string, mixed>|null  $fonts
     * @return array<string, mixed>
     */
    protected static function resolveElement(array $element, ?array $colors, ?array $fonts): array
    {
        foreach (self::ELEMENT_COLOR_FIELDS as $field) {
            if (array_key_exists($field, $element)) {
                $element[$field] = self::resolveColor($element[$field], $colors);
            }
        }

        if (array_key_exists('font_family', $element)) {
            $element['font_family'] = self::resolveFont($element['font_family'], $fonts);
        }

        return $element;
    }

    /**
     * @return array{0: array<string, mixed>|null, 1: array<string, mixed>|null}
     */
    protected static function maps(?BrandKit $kit): array
    {
        if ($kit === null) {
            return [null, null];
        }

        return [
            is_array($kit->colors) ? $kit->colors : null,
            is_array($kit->fonts) ? $kit->fonts : null,
        ];
    }
}
