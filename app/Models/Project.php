<?php

namespace App\Models;

use App\Enums\ProjectStatus;
use Database\Factories\ProjectFactory;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Project extends Model
{
    /** @use HasFactory<ProjectFactory> */
    use HasFactory;

    /**
     * The duration a scene falls back to when it carries none. Shared with the
     * render pipeline and the composition builders so every layer of the stack
     * places a timing-less scene at the same spot on the timeline.
     */
    public const DEFAULT_SCENE_DURATION_MS = 5000;

    /**
     * The duration a timeline element falls back to when neither `end_ms` nor
     * `duration_ms` is known.
     */
    public const DEFAULT_ELEMENT_DURATION_MS = 5000;

    public const DEFAULT_RESOLUTION_WIDTH = 1920;

    public const DEFAULT_RESOLUTION_HEIGHT = 1080;

    /**
     * Property paths that may carry a keyframe track.
     *
     * @var array<int, string>
     */
    public const KEYFRAMABLE_PROPERTIES = [
        'x',
        'y',
        'width',
        'height',
        'rotation',
        'opacity',
        'volume',
        'adjustments.brightness',
        'adjustments.contrast',
        'adjustments.saturation',
    ];

    /**
     * Named easings a keyframe may use; a keyframe may also carry a
     * four-number cubic-bezier array instead.
     *
     * @var array<int, string>
     */
    public const KEYFRAME_EASINGS = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'hold'];

    /**
     * Element types whose media is scaled into the element box, and therefore
     * carry a `fit` mode.
     *
     * @var array<int, string>
     */
    public const FITTED_ELEMENT_TYPES = ['video', 'image'];

    protected $fillable = [
        'user_id',
        'name',
        'resolution_width',
        'resolution_height',
        'fps',
        'scenes',
        'audio_tracks',
        'video_tracks',
        'subtitle_tracks',
        'status',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'resolution_width' => 'integer',
            'resolution_height' => 'integer',
            'fps' => 'integer',
            'status' => ProjectStatus::class,
        ];
    }

    /**
     * Scenes always carry a `layers` array, even when a writer (the AI compose
     * tool, a partial editor payload) omitted it; the editor iterates it
     * unconditionally.
     *
     * @return Attribute<array<int, array<string, mixed>>, array<int, array<string, mixed>>>
     */
    protected function scenes(): Attribute
    {
        return Attribute::make(
            get: fn (?string $value): array => $this->normalizeWithChildList($value ? json_decode($value, true) : [], 'layers'),
            set: fn (array $value): string => json_encode($this->normalizeWithChildList($value, 'layers'), JSON_THROW_ON_ERROR),
        );
    }

    /**
     * Video tracks always carry a `clips` array, for the same reason as scenes.
     *
     * @return Attribute<array<int, array<string, mixed>>, array<int, array<string, mixed>>>
     */
    protected function videoTracks(): Attribute
    {
        return Attribute::make(
            get: fn (?string $value): array => $this->normalizeWithChildList($value ? json_decode($value, true) : [], 'clips'),
            set: fn (array $value): string => json_encode($this->normalizeWithChildList($value, 'clips'), JSON_THROW_ON_ERROR),
        );
    }

    /**
     * Subtitle tracks always carry an `entries` array. Unlike scenes and video
     * tracks the entries are not canvas elements, so they keep their own shape
     * — the attribute exists so subtitle tracks stop bypassing normalization
     * the way the plain `array` cast used to let them.
     *
     * @return Attribute<array<int, array<string, mixed>>, array<int, array<string, mixed>>>
     */
    protected function subtitleTracks(): Attribute
    {
        return Attribute::make(
            get: fn (?string $value): array => $this->normalizeSubtitleTracks($value ? json_decode($value, true) : []),
            set: fn (?array $value): string => json_encode($this->normalizeSubtitleTracks($value ?? []), JSON_THROW_ON_ERROR),
        );
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    protected function normalizeSubtitleTracks(mixed $tracks): array
    {
        if (! is_array($tracks)) {
            return [];
        }

        return array_values(array_map(function (array $track): array {
            $entries = is_array($track['entries'] ?? null) ? $track['entries'] : [];
            $track['entries'] = array_values(array_filter($entries, 'is_array'));

            return $track;
        }, array_filter($tracks, 'is_array')));
    }

    /**
     * Normalize a list of scenes (children: `layers`) or video tracks
     * (children: `clips`).
     *
     * Every element is a timeline element with absolute `start_ms`/`end_ms`, so
     * the enclosing container has to hand its own span down: a scene's span is
     * the running prefix sum of the scene durations before it, while a video
     * track's clips already carry their own absolute `start_ms`.
     *
     * @return array<int, array<string, mixed>>
     */
    protected function normalizeWithChildList(mixed $items, string $childKey): array
    {
        if (! is_array($items)) {
            return [];
        }

        $isScene = $childKey === 'layers';
        $sceneStartMs = 0;
        $normalized = [];

        foreach (array_filter($items, 'is_array') as $item) {
            $durationMs = $this->positiveInt($item['duration_ms'] ?? null, self::DEFAULT_SCENE_DURATION_MS);

            $context = [
                'track_id' => is_string($item['id'] ?? null) ? $item['id'] : null,
                'start_ms' => $isScene ? $sceneStartMs : null,
                'end_ms' => $isScene ? $sceneStartMs + $durationMs : null,
            ];

            $children = is_array($item[$childKey] ?? null) ? array_values($item[$childKey]) : [];
            $item[$childKey] = array_values(array_map(
                fn (array $child): array => $this->normalizeElement($child, $context),
                array_filter($children, 'is_array')
            ));

            if ($isScene) {
                $sceneStartMs += $durationMs;
            }

            $normalized[] = $item;
        }

        return $normalized;
    }

    /**
     * Shared defaults for timeline elements (scene layers and overlay clips):
     * legacy rows carry no `type` (always video), no absolute timing, and may
     * lack the text/shape fields the render assumes. Mirrors
     * `normalizeElement()` on the frontend.
     *
     * Unknown element types and non-canonical enum values (production carries
     * `type: "effect"` and `shape: "rect"`) pass through untouched — this is a
     * defaulting pass, not a validator, and it never drops a key it does not
     * recognise.
     *
     * @param  array<string, mixed>  $element
     * @param  array{track_id: string|null, start_ms: int|null, end_ms: int|null}  $context
     * @return array<string, mixed>
     */
    protected function normalizeElement(array $element, array $context = ['track_id' => null, 'start_ms' => null, 'end_ms' => null]): array
    {
        $element['type'] ??= 'video';
        $element['x'] ??= 0;
        $element['y'] ??= 0;
        $element['width'] ??= $this->defaultElementWidth();
        $element['height'] ??= $this->defaultElementHeight();
        $element['z_index'] ??= 0;

        // A scene layer inherits the scene's span; a video-track clip already
        // owns an absolute `start_ms` and only needs `end_ms` derived from its
        // duration. Elements that already carry timing keep it verbatim, which
        // makes the upgrade idempotent.
        $element['start_ms'] = $this->positiveInt($element['start_ms'] ?? null, $context['start_ms'] ?? 0);
        $element['end_ms'] = $this->positiveInt(
            $element['end_ms'] ?? null,
            $context['end_ms'] ?? $element['start_ms'] + $this->positiveInt($element['duration_ms'] ?? null, self::DEFAULT_ELEMENT_DURATION_MS),
        );

        if ($context['track_id'] !== null) {
            $element['track_id'] = is_string($element['track_id'] ?? null) && $element['track_id'] !== ''
                ? $element['track_id']
                : $context['track_id'];
        }

        if (in_array($element['type'], self::FITTED_ELEMENT_TYPES, true)) {
            $element['fit'] ??= 'cover';
        }

        if ($element['type'] === 'text') {
            $element['text'] ??= '';
            $element['font_size'] ??= 48;
            $element['font_color'] ??= '#ffffff';
        }

        if ($element['type'] === 'shape') {
            $element['shape'] ??= 'rectangle';
            $element['fill_color'] ??= '#ffffff';
        }

        return $element;
    }

    /**
     * The width a timeline element falls back to: a quarter of the canvas.
     */
    public function defaultElementWidth(): int
    {
        return (int) round(($this->resolution_width ?? self::DEFAULT_RESOLUTION_WIDTH) / 4);
    }

    /**
     * The height a timeline element falls back to: a quarter of the canvas.
     */
    public function defaultElementHeight(): int
    {
        return (int) round(($this->resolution_height ?? self::DEFAULT_RESOLUTION_HEIGHT) / 4);
    }

    protected function positiveInt(mixed $value, int $default): int
    {
        if (! is_numeric($value)) {
            return $default;
        }

        return max(0, (int) $value);
    }

    /**
     * @return Attribute<array<int, array<string, mixed>>, array<int, array<string, mixed>>>
     */
    protected function audioTracks(): Attribute
    {
        return Attribute::make(
            get: fn (?string $value): array => $this->normalizeAudioTracks($value ? json_decode($value, true) : []),
            set: fn (array $value): string => json_encode($this->normalizeAudioTracks($value), JSON_THROW_ON_ERROR),
        );
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    protected function normalizeAudioTracks(mixed $tracks): array
    {
        if (! is_array($tracks)) {
            return [];
        }

        return array_values(array_map(function (array $track): array {
            $track['volume'] = $this->finiteFloat($track['volume'] ?? 1.0, 1.0, 0.0, 2.0);
            $track['muted'] = (bool) ($track['muted'] ?? false);
            $track['clips'] = array_values(array_map(function (array $clip): array {
                $clip['volume'] = $this->finiteFloat($clip['volume'] ?? 1.0, 1.0, 0.0, 2.0);

                return $clip;
            }, is_array($track['clips'] ?? null) ? $track['clips'] : []));

            return $track;
        }, $tracks));
    }

    protected function finiteFloat(mixed $value, float $default, float $min, float $max): float
    {
        $number = is_numeric($value) ? (float) $value : $default;

        if (! is_finite($number)) {
            $number = $default;
        }

        return min($max, max($min, $number));
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return HasMany<Asset, $this>
     */
    public function assets(): HasMany
    {
        return $this->hasMany(Asset::class);
    }

    /**
     * @return HasMany<Generation, $this>
     */
    public function generations(): HasMany
    {
        return $this->hasMany(Generation::class);
    }

    /**
     * @return HasMany<Render, $this>
     */
    public function renders(): HasMany
    {
        return $this->hasMany(Render::class);
    }
}
