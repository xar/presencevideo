<?php

namespace App\Ai\Tools;

use App\Enums\GenerationStatus;
use App\Events\AgentActivityUpdated;
use App\Jobs\RunGeneration;
use App\Models\AgentActivity;
use App\Models\Generation;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Arr;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

class RegenerateAtFullQuality implements Tool
{
    public function __construct(
        protected ?object $user = null,
        protected ?string $conversationId = null,
    ) {}

    public function name(): string
    {
        return 'regenerate_at_full_quality';
    }

    public function description(): Stringable|string
    {
        return 'Re-run a draft generation at full quality. Same model, prompt, input asset and parameters, only without the draft resolution cap. Use it once the user approves a draft shot. Returns a new generation_id to poll with get_generation_status.';
    }

    public function handle(Request $request): Stringable|string
    {
        $draft = Generation::query()
            ->whereKey($request['generation_id'])
            ->when($this->user?->id !== null, fn ($query) => $query->where('user_id', $this->user->id))
            ->firstOrFail();

        $parameters = Arr::except($draft->parameters ?? [], [
            'quality_tier',
            'agent_activity_id',
            'agent_conversation_id',
            'transcription_text',
            'transcription_chunks',
        ]);

        if ($this->conversationId !== null) {
            $parameters['agent_conversation_id'] = $this->conversationId;
        }

        $activity = $this->createActivity($draft);

        if ($activity !== null) {
            $parameters['agent_activity_id'] = $activity->id;
        }

        $generation = Generation::create([
            'user_id' => $draft->user_id,
            'project_id' => $draft->project_id,
            'scene_id' => $draft->scene_id,
            'step_index' => $draft->step_index,
            'type' => $draft->type,
            'provider' => $draft->provider,
            'model' => $draft->model,
            'prompt' => $draft->prompt,
            'input_asset_id' => $draft->input_asset_id,
            'parameters' => $parameters,
            'status' => GenerationStatus::Pending,
        ]);

        RunGeneration::dispatch($generation);

        if ($activity !== null) {
            $activity->update([
                'payload' => array_merge($activity->payload ?? [], ['generation_id' => $generation->id]),
            ]);

            AgentActivityUpdated::dispatchQuietly($activity);
        }

        return json_encode([
            'generation_id' => $generation->id,
            'draft_generation_id' => $draft->id,
            'activity_id' => $activity?->id,
            'project_id' => $generation->project_id,
            'type' => $generation->type->value,
            'status' => $generation->status->value,
            'quality_tier' => 'final',
            'message' => 'Full-quality re-run queued. It produces a NEW output_asset_id; swap the draft asset for it in the composition once it completes.',
        ], JSON_THROW_ON_ERROR);
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'generation_id' => $schema->integer()->required(),
        ];
    }

    protected function createActivity(Generation $draft): ?AgentActivity
    {
        if ($this->conversationId === null) {
            return null;
        }

        $activity = AgentActivity::create([
            'conversation_id' => $this->conversationId,
            'user_id' => $this->user?->id,
            'type' => 'fal_generation',
            'name' => 'regenerate_at_full_quality',
            'status' => 'running',
            'payload' => [
                'project_id' => $draft->project_id,
                'generation_type' => $draft->type->value,
                'prompt' => $draft->prompt,
                'model' => $draft->model,
                'quality_tier' => 'final',
                'draft_generation_id' => $draft->id,
                'message' => 'Re-running '.$draft->type->value.' generation at full quality.',
            ],
            'started_at' => now(),
        ]);

        AgentActivityUpdated::dispatchQuietly($activity);

        return $activity;
    }
}
