<?php

namespace App\Ai\Tools;

use App\Services\ModelCliService;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

class ListVideoRecipes implements Tool
{
    public function __construct(protected ?ModelCliService $cli = null) {}

    public function name(): string
    {
        return 'list_video_recipes';
    }

    public function description(): Stringable|string
    {
        return 'List the deterministic video recipes (templates as code) and the brand kit slots each consumes. A recipe turns script beats plus a brand kit into a complete, lint-clean composition.';
    }

    public function handle(Request $request): Stringable|string
    {
        $cli = $this->cli ?? app(ModelCliService::class);

        return json_encode(['recipes' => $cli->listRecipes()], JSON_THROW_ON_ERROR);
    }

    public function schema(JsonSchema $schema): array
    {
        return [];
    }
}
