<?php

namespace App\Models;

use Database\Factories\BrandKitFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A reusable set of brand decisions (colour roles, font roles, logos, voice,
 * music, tone) a project is styled with.
 *
 * Elements never copy a kit's values: they store `brand.<role>` tokens which
 * `App\Support\BrandTokens` (PHP) and `model/brand.ts` (TS) resolve at render
 * time, so swapping the kit restyles every project that references it. The
 * serialised shape of this model is the `BrandKit` type in
 * `resources/js/types/editor.ts`; keep the two in step.
 */
class BrandKit extends Model
{
    /** @use HasFactory<BrandKitFactory> */
    use HasFactory;

    /**
     * Colour roles a kit may define and an element may reference as `brand.<role>`.
     *
     * @var array<int, string>
     */
    public const COLOR_ROLES = ['primary', 'secondary', 'accent', 'background', 'text', 'caption_highlight'];

    /**
     * Font roles a kit may define and an element may reference as `brand.<role>`.
     *
     * @var array<int, string>
     */
    public const FONT_ROLES = ['display', 'body', 'caption'];

    /**
     * @var array<int, string>
     */
    public const LOGO_VARIANTS = ['full', 'mark', 'light', 'dark'];

    /**
     * @var array<int, string>
     */
    public const WATERMARK_POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

    protected $fillable = [
        'user_id',
        'name',
        'colors',
        'fonts',
        'logos',
        'watermark',
        'intro_asset_id',
        'outro_asset_id',
        'voice',
        'music',
        'caption_preset',
        'motion_preset',
        'tone',
    ];

    protected $attributes = [
        'colors' => '{}',
        'fonts' => '{}',
        'logos' => '{}',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'colors' => 'array',
            'fonts' => 'array',
            'logos' => 'array',
            'watermark' => 'array',
            'voice' => 'array',
            'music' => 'array',
            'intro_asset_id' => 'integer',
            'outro_asset_id' => 'integer',
        ];
    }

    /**
     * The JSON shape the editor expects: every key present, arrays for the
     * three required maps and explicit nulls for the optional ones.
     *
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        $array = parent::toArray();

        foreach (['colors', 'fonts', 'logos'] as $map) {
            $array[$map] = is_array($array[$map] ?? null) ? $array[$map] : [];
        }

        foreach (['watermark', 'intro_asset_id', 'outro_asset_id', 'voice', 'music', 'caption_preset', 'motion_preset', 'tone'] as $optional) {
            $array[$optional] = $array[$optional] ?? null;
        }

        return $array;
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return HasMany<Project, $this>
     */
    public function projects(): HasMany
    {
        return $this->hasMany(Project::class);
    }

    /**
     * @return BelongsTo<Asset, $this>
     */
    public function introAsset(): BelongsTo
    {
        return $this->belongsTo(Asset::class, 'intro_asset_id');
    }

    /**
     * @return BelongsTo<Asset, $this>
     */
    public function outroAsset(): BelongsTo
    {
        return $this->belongsTo(Asset::class, 'outro_asset_id');
    }
}
