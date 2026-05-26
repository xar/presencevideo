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
            'scenes' => 'array',
            'video_tracks' => 'array',
            'subtitle_tracks' => 'array',
            'status' => ProjectStatus::class,
        ];
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
