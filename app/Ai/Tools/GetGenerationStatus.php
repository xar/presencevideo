<?php

namespace App\Ai\Tools;

use App\Models\Generation;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

class GetGenerationStatus implements Tool
{
    public function __construct(protected ?object $user = null) {}

    public function name(): string
    {
        return 'get_generation_status';
    }

    public function description(): Stringable|string
    {
        return 'Get status for a fal.ai generation and the output_asset_id when it completes.';
    }

    public function handle(Request $request): Stringable|string
    {
        $generation = Generation::query()
            ->with('outputAsset:id,project_id,type,name,duration_ms,width,height,mime_type')
            ->whereKey($request['generation_id'])
            ->when($this->user?->id !== null, fn ($query) => $query->where('user_id', $this->user->id))
            ->firstOrFail();

        return json_encode([
            'generation_id' => $generation->id,
            'project_id' => $generation->project_id,
            'type' => $generation->type->value,
            'status' => $generation->status->value,
            'output_asset_id' => $generation->output_asset_id,
            'asset' => $generation->outputAsset,
            'error_message' => $generation->error_message,
            'transcription_text' => $generation->parameters['transcription_text'] ?? null,
            'transcription_chunks' => $generation->parameters['transcription_chunks'] ?? null,
        ], JSON_THROW_ON_ERROR);
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'generation_id' => $schema->integer()->required(),
        ];
    }
}
