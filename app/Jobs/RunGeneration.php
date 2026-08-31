<?php

namespace App\Jobs;

use App\Enums\GenerationStatus;
use App\Events\AgentActivityUpdated;
use App\Models\AgentActivity;
use App\Models\Generation;
use App\Services\FalAIService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

class RunGeneration implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $backoff = 60;

    public int $timeout = 600;

    /**
     * Create a new job instance.
     */
    public function __construct(public Generation $generation) {}

    /**
     * Execute the job.
     */
    public function handle(FalAIService $falAI): void
    {
        $this->generation->update(['status' => GenerationStatus::Processing]);

        try {
            $result = $falAI->generate($this->generation);

            if ($result->success) {
                $updateData = [
                    'status' => GenerationStatus::Completed,
                    'output_asset_id' => $result->assetId,
                    'fal_request_id' => $result->requestId,
                    'alternatives' => $result->alternatives ?? [],
                ];

                // Store transcription data in parameters for speech_to_text
                if ($result->transcriptionChunks !== null) {
                    $updateData['parameters'] = array_merge(
                        $this->generation->parameters ?? [],
                        [
                            'transcription_text' => $result->transcriptionText,
                            'transcription_chunks' => $result->transcriptionChunks,
                            'transcription_words' => $result->transcriptionWords ?? [],
                        ]
                    );
                }

                $this->generation->update($updateData);

                $this->updateAgentActivity('completed', $result->assetId);
                $this->continueAgentConversation('completed', $result->assetId);
            } else {
                $this->generation->update([
                    'status' => GenerationStatus::Failed,
                    'error_message' => $result->error,
                ]);

                $this->updateAgentActivity('failed');
                $this->continueAgentConversation('failed');
            }
        } catch (\Throwable $e) {
            Log::error('Generation failed', [
                'generation_id' => $this->generation->id,
                'error' => $e->getMessage(),
            ]);

            $this->generation->update([
                'status' => GenerationStatus::Failed,
                'error_message' => $e->getMessage(),
            ]);

            $this->updateAgentActivity('failed');
            $this->continueAgentConversation('failed');

            throw $e;
        }
    }

    protected function updateAgentActivity(string $status, ?int $assetId = null): void
    {
        $activityId = $this->generation->parameters['agent_activity_id'] ?? null;

        if (! is_int($activityId) && ! is_numeric($activityId)) {
            return;
        }

        $activity = AgentActivity::find($activityId);

        if ($activity === null) {
            return;
        }

        $activity->update([
            'status' => $status,
            'payload' => array_merge($activity->payload ?? [], [
                'generation_id' => $this->generation->id,
                'status' => $status,
                'output_asset_id' => $assetId,
                'error_message' => $this->generation->error_message,
                'message' => $status === 'completed' ? 'fal.ai generation completed. Continuing the agent workflow…' : 'fal.ai generation failed. Returning the failure to the agent…',
            ]),
            'finished_at' => now(),
        ]);

        AgentActivityUpdated::dispatch($activity);
    }

    protected function continueAgentConversation(string $status, ?int $assetId = null): void
    {
        $conversationId = $this->generation->parameters['agent_conversation_id'] ?? null;

        if (! is_string($conversationId) || $this->generation->user_id === null) {
            return;
        }

        ContinueAgentConversation::dispatch(
            $conversationId,
            $this->generation->user_id,
            json_encode([
                'event' => 'fal_generation_finished',
                'generation_id' => $this->generation->id,
                'project_id' => $this->generation->project_id,
                'type' => $this->generation->type->value,
                'status' => $status,
                'output_asset_id' => $assetId,
                'error_message' => $this->generation->error_message,
                'instruction' => 'Continue the orchestrated video creation workflow from this async CreatorAgent tool result. Tell the user what just happened, then delegate back to creator_agent with this complete event payload if composition, additional generation, or rendering work is still needed. If the production is complete, summarize the final deliverable.',
            ], JSON_THROW_ON_ERROR),
        );
    }
}
