<?php

namespace App\Ai\Tools;

use App\Models\Render;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

class GetRenderStatus implements Tool
{
    public function __construct(protected ?object $user = null) {}

    public function name(): string
    {
        return 'get_render_status';
    }

    public function description(): Stringable|string
    {
        return 'Get the status, progress, and output URL for a queued video render.';
    }

    public function handle(Request $request): Stringable|string
    {
        $render = Render::query()
            ->whereKey($request['render_id'])
            ->when($this->user?->id !== null, fn ($query) => $query->where('user_id', $this->user->id))
            ->firstOrFail();

        return json_encode([
            'render_id' => $render->id,
            'project_id' => $render->project_id,
            'status' => $render->status->value,
            'progress' => $render->progress,
            'output_path' => $render->output_path,
            'output_url' => $render->output_url,
            'error_message' => $render->error_message,
        ], JSON_THROW_ON_ERROR);
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'render_id' => $schema->integer()->required(),
        ];
    }
}
