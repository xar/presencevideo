<?php

namespace App\Ai\Tools;

use App\Models\BrandKit;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

class GetBrandKit implements Tool
{
    public function __construct(protected ?object $user = null) {}

    public function name(): string
    {
        return 'get_brand_kit';
    }

    public function description(): Stringable|string
    {
        return 'Read one brand kit in full: colours (reference as brand.primary, brand.secondary, brand.accent, brand.background, brand.text, brand.caption_highlight), fonts (brand.display, brand.body, brand.caption), logo/intro/outro asset ids, watermark, voice, music, caption preset and tone of voice.';
    }

    public function handle(Request $request): Stringable|string
    {
        $kit = BrandKit::query()
            ->whereKey($request['brand_kit_id'])
            ->when($this->user?->id !== null, fn ($query) => $query->where('user_id', $this->user->id))
            ->firstOrFail();

        return json_encode(['brand_kit' => $kit->toArray()], JSON_THROW_ON_ERROR);
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'brand_kit_id' => $schema->integer()->required(),
        ];
    }
}
