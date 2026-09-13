<?php

namespace App\Ai\Tools;

use App\Ai\Tools\Concerns\ResolvesUserProject;
use App\Models\BrandKit;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

class SetProjectBrandKit implements Tool
{
    use ResolvesUserProject;

    public function __construct(protected ?object $user = null) {}

    public function name(): string
    {
        return 'set_project_brand_kit';
    }

    public function description(): Stringable|string
    {
        return 'Attach a brand kit to a video project (or detach it by omitting brand_kit_id). Every brand.* token in the project then resolves against that kit.';
    }

    public function handle(Request $request): Stringable|string
    {
        $project = $this->userProject($request['project_id']);
        $kitId = $request['brand_kit_id'] ?? null;

        if ($kitId !== null) {
            $kitId = BrandKit::query()
                ->whereKey($kitId)
                ->when($this->user?->id !== null, fn ($query) => $query->where('user_id', $this->user->id))
                ->firstOrFail()
                ->id;
        }

        $project->forceFill(['brand_kit_id' => $kitId])->save();

        return json_encode([
            'project_id' => $project->id,
            'brand_kit_id' => $project->brand_kit_id,
            'message' => $kitId === null ? 'Brand kit detached.' : 'Brand kit attached; brand.* tokens now resolve against it.',
        ], JSON_THROW_ON_ERROR);
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'project_id' => $schema->integer()->required(),
            'brand_kit_id' => $schema->integer(),
        ];
    }
}
