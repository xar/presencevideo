<?php

namespace App\Jobs;

use App\Enums\GenerationStatus;
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
                        ]
                    );
                }

                $this->generation->update($updateData);

                $this->continueAgentConversation('completed', $result->assetId);
            } else {
                $this->generation->update([
                    'status' => GenerationStatus::Failed,
                    'error_message' => $result->error,
                ]);

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

            $this->continueAgentConversation('failed');

            throw $e;
        }
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
                'instruction' => 'Continue the video creation workflow from this async tool result. If an asset was generated, place it in the project composition or queue the next needed generation.',
            ], JSON_THROW_ON_ERROR),
        );
    }
}
