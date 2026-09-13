<?php

namespace App\Ai\Tools;

use App\Models\BrandKit;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

class ListBrandKits implements Tool
{
    public function __construct(protected ?object $user = null) {}

    public function name(): string
    {
        return 'list_brand_kits';
    }

    public function description(): Stringable|string
    {
        return 'List the current user\'s brand kits (id, name, colour roles, font roles, which logo/outro/watermark/voice slots are filled). Use before composing so the project can be styled with brand.* tokens.';
    }

    public function handle(Request $request): Stringable|string
    {
        $kits = BrandKit::query()
            ->when($this->user?->id !== null, fn ($query) => $query->where('user_id', $this->user->id))
            ->orderBy('name')
            ->get()
            ->map(fn (BrandKit $kit): array => [
                'brand_kit_id' => $kit->id,
                'name' => $kit->name,
                'colors' => array_keys(array_filter($kit->colors ?? [])),
                'fonts' => array_keys(array_filter($kit->fonts ?? [])),
                'has_logo' => array_filter($kit->logos ?? []) !== [],
                'has_outro' => $kit->outro_asset_id !== null,
                'has_intro' => $kit->intro_asset_id !== null,
                'has_watermark' => ($kit->watermark['asset_id'] ?? null) !== null,
                'has_voice' => ($kit->voice['model_id'] ?? null) !== null || ($kit->voice['voice_id'] ?? null) !== null,
                'caption_preset' => $kit->caption_preset,
                'tone' => $kit->tone,
            ])
            ->values();

        return json_encode(['brand_kits' => $kits], JSON_THROW_ON_ERROR);
    }

    public function schema(JsonSchema $schema): array
    {
        return [];
    }
}
