<?php

namespace App\Ai\Tools;

use App\Models\Asset;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

class ListVideoProjectAssets implements Tool
{
    public function __construct(protected ?object $user = null) {}

    public function name(): string
    {
        return 'list_video_project_assets';
    }

    public function description(): Stringable|string
    {
        return 'List the current user assets that can be referenced by asset_id while composing video projects. Filter by optional project_id and type: image, video, or audio.';
    }

    public function handle(Request $request): Stringable|string
    {
        $query = Asset::query()
            ->select(['id', 'project_id', 'type', 'name', 'duration_ms', 'width', 'height', 'mime_type'])
            ->latest('id')
            ->limit(50);

        if ($this->user?->id !== null) {
            $query->where('user_id', $this->user->id);
        }

        if (($request['project_id'] ?? null) !== null) {
            $query->where('project_id', $request['project_id']);
        }

        if (($request['type'] ?? null) !== null) {
            $query->where('type', $request['type']);
        }

        return $query->get()->toJson(JSON_THROW_ON_ERROR);
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'project_id' => $schema->integer(),
            'type' => $schema->string(),
        ];
    }
}
