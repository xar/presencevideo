<?php

namespace App\Models;

use Database\Factories\BrandKitFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

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
        'website_url',
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
     * The intake token is a bearer capability: it is handed out once, through
     * the endpoint that mints it, and never rides along on an ordinary kit
     * payload (the editor page, the headless render payload).
     *
     * @var list<string>
     */
    protected $hidden = ['intake_token', 'intake_token_expires_at'];

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
            'intake_token_expires_at' => 'datetime',
        ];
    }

    /**
     * Mint (or re-mint) the capability an outside LLM agent fills this kit with.
     *
     * Minting always replaces whatever token the kit had: the old link stops
     * working the moment a new one is copied, so a prompt pasted into a chat
     * that is no longer wanted cannot be replayed later.
     */
    public function issueIntakeToken(): string
    {
        $token = (string) Str::uuid();

        $this->forceFill([
            'intake_token' => $token,
            'intake_token_expires_at' => now()->addDays((int) config('brand_intake.token_ttl_days', 7)),
        ])->save();

        return $token;
    }

    public function revokeIntakeToken(): void
    {
        $this->forceFill(['intake_token' => null, 'intake_token_expires_at' => null])->save();
    }

    /**
     * Resolve an intake token to the single kit it may write, or null when the
     * token is unknown or has expired.
     */
    public static function findByIntakeToken(string $token): ?self
    {
        return static::query()
            ->where('intake_token', $token)
            ->where('intake_token_expires_at', '>', now())
            ->first();
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

        foreach (['website_url', 'watermark', 'intro_asset_id', 'outro_asset_id', 'voice', 'music', 'caption_preset', 'motion_preset', 'tone'] as $optional) {
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
