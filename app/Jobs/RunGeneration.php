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
            } else {
                $this->generation->update([
                    'status' => GenerationStatus::Failed,
                    'error_message' => $result->error,
                ]);
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

            throw $e;
        }
    }
}
