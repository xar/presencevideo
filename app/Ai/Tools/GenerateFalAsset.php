<?php

namespace App\Ai\Tools;

use App\Enums\GenerationStatus;
use App\Enums\GenerationType;
use App\Events\AgentActivityUpdated;
use App\Jobs\RunGeneration;
use App\Models\AgentActivity;
use App\Models\Asset;
use App\Models\Generation;
use App\Models\Project;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

class GenerateFalAsset implements Tool
{
    public function __construct(
        protected ?object $user = null,
        protected ?string $conversationId = null,
    ) {}

    public function name(): string
    {
        return 'generate_fal_asset';
    }

    public function description(): Stringable|string
    {
        return 'Queue a fal.ai generation to create an asset for a video project. Use for text_to_image, image_to_video, text_to_music, text_to_speech, text_to_sfx, and speech_to_text. Returns a generation_id; poll get_generation_status until completed to get output_asset_id.';
    }

    public function handle(Request $request): Stringable|string
    {
        $project = $this->project((int) $request['project_id']);
        $type = GenerationType::from($request['type']);
        $inputAssetId = $request['input_asset_id'] ?? null;

        if ($inputAssetId !== null) {
            $exists = Asset::query()
                ->whereKey($inputAssetId)
                ->where('project_id', $project->id)
                ->where('user_id', $this->user?->id)
                ->exists();

            if (! $exists) {
                throw ValidationException::withMessages(['input_asset_id' => 'The input asset is not available for this project.']);
            }
        }

        $parameters = $this->decodeParameters($request['parameters_json'] ?? '{}');
        $model = $request['model_id'] ?? $request['model_key'] ?? null;

        if ($model !== null) {
            $parameters['model_key'] = $model;
        }

        $activity = $this->createActivity($project, $type, $request);

        if ($this->conversationId !== null) {
            $parameters['agent_conversation_id'] = $this->conversationId;
        }

        if ($activity !== null) {
            $parameters['agent_activity_id'] = $activity->id;
        }

        $generation = Generation::create([
            'user_id' => $this->user?->id,
            'project_id' => $project->id,
            'scene_id' => $this->resolveSceneId($project, $request['scene_id'] ?? null),
            'step_index' => $request['step_index'] ?? null,
            'type' => $type,
            'provider' => 'fal',
            'model' => $model,
            'prompt' => $request['prompt'] ?? '',
            'input_asset_id' => $inputAssetId,
            'parameters' => $parameters,
            'status' => GenerationStatus::Pending,
        ]);

        RunGeneration::dispatch($generation);

        $activity?->update([
            'payload' => array_merge($activity->payload ?? [], ['generation_id' => $generation->id]),
        ]);

        if ($activity !== null) {
            AgentActivityUpdated::dispatch($activity);
        }

        return json_encode([
            'generation_id' => $generation->id,
            'activity_id' => $activity?->id,
            'project_id' => $project->id,
            'type' => $generation->type->value,
            'status' => $generation->status->value,
            'message' => 'Generation queued. Progress is now visible in the chat activity panel; use get_generation_status with this generation_id to retrieve the output asset when complete.',
        ], JSON_THROW_ON_ERROR);
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'project_id' => $schema->integer()->required(),
            'type' => $schema->string()->required(),
            'prompt' => $schema->string(),
            'input_asset_id' => $schema->integer(),
            'model_key' => $schema->string(),
            'model_id' => $schema->string(),
            'parameters_json' => $schema->string(),
            'scene_id' => $schema->string(),
            'step_index' => $schema->integer(),
        ];
    }

    protected function createActivity(Project $project, GenerationType $type, Request $request): ?AgentActivity
    {
        if ($this->conversationId === null) {
            return null;
        }

        $activity = AgentActivity::create([
            'conversation_id' => $this->conversationId,
            'user_id' => $this->user?->id,
            'type' => 'fal_generation',
            'name' => 'generate_fal_asset',
            'status' => 'running',
            'payload' => [
                'project_id' => $project->id,
                'generation_type' => $type->value,
                'prompt' => $request['prompt'] ?? '',
                'model' => $request['model_id'] ?? $request['model_key'] ?? null,
                'message' => 'Queued fal.ai '.$type->value.' generation.',
            ],
            'started_at' => now(),
        ]);

        AgentActivityUpdated::dispatch($activity);

        return $activity;
    }

    protected function project(int $projectId): Project
    {
        return Project::query()
            ->whereKey($projectId)
            ->when($this->user?->id !== null, fn ($query) => $query->where('user_id', $this->user->id))
            ->firstOrFail();
    }

    protected function resolveSceneId(Project $project, mixed $sceneId): ?string
    {
        if (! is_string($sceneId) || $sceneId === '') {
            return null;
        }

        $matchingScene = collect($project->scenes ?? [])->first(fn (array $scene) => ($scene['id'] ?? null) === $sceneId || ($scene['name'] ?? null) === $sceneId
        );

        $resolvedSceneId = $matchingScene['id'] ?? $sceneId;

        return is_string($resolvedSceneId) && Str::isUuid($resolvedSceneId) ? $resolvedSceneId : null;
    }

    /**
     * @return array<string, mixed>
     */
    protected function decodeParameters(string $parametersJson): array
    {
        $parameters = json_decode($parametersJson, true, flags: JSON_THROW_ON_ERROR);

        return is_array($parameters) ? $parameters : [];
    }
}
