<?php

namespace App\Console\Commands;

use App\Enums\GenerationStatus;
use App\Models\Generation;
use App\Services\FalAI\FalClient;
use App\Services\FalAIService;
use Illuminate\Console\Command;

class ResumeGeneration extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'generation:resume
                            {id? : The generation ID to resume}
                            {--check : Only check status, do not resume}
                            {--all : Resume all stuck generations}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Resume or check status of stuck fal.ai generations';

    /**
     * Execute the console command.
     */
    public function handle(FalAIService $falAI, FalClient $falClient): int
    {
        if ($this->option('all')) {
            return $this->resumeAllStuck($falAI, $falClient);
        }

        $id = $this->argument('id');

        if (! $id) {
            // Show all stuck generations
            $stuck = Generation::where('status', GenerationStatus::Processing)
                ->whereNotNull('fal_request_id')
                ->get();

            if ($stuck->isEmpty()) {
                $this->info('No stuck generations found.');

                return self::SUCCESS;
            }

            $this->table(
                ['ID', 'Type', 'Model', 'Fal Request ID', 'Created At'],
                $stuck->map(fn ($g) => [
                    $g->id,
                    $g->type->value,
                    $g->model,
                    $g->fal_request_id,
                    $g->created_at->diffForHumans(),
                ])
            );

            return self::SUCCESS;
        }

        $generation = Generation::find($id);

        if (! $generation) {
            $this->error("Generation {$id} not found.");

            return self::FAILURE;
        }

        $this->info("Generation #{$generation->id}");
        $this->line("  Type: {$generation->type->value}");
        $this->line("  Status: {$generation->status->value}");
        $this->line('  Fal Request ID: '.($generation->fal_request_id ?? 'N/A'));

        if (! $generation->fal_request_id) {
            $this->error('No fal_request_id saved for this generation.');

            return self::FAILURE;
        }

        // Get model config to check status
        $modelConfig = $falAI->getModelConfig($generation->type, $generation->parameters['model_key'] ?? 'default');
        $modelId = $modelConfig['id'] ?? $generation->model;

        $status = $falClient->checkStatus($modelId, $generation->fal_request_id);
        $this->line('  Fal Status: '.($status['status'] ?? 'UNKNOWN'));

        if (isset($status['progress'])) {
            $this->line("  Progress: {$status['progress']}%");
        }

        if ($this->option('check')) {
            return self::SUCCESS;
        }

        if (! $this->confirm('Resume this generation?')) {
            return self::SUCCESS;
        }

        $this->info('Resuming...');
        $result = $falAI->resumeGeneration($generation);

        if ($result->success) {
            $generation->update([
                'status' => GenerationStatus::Completed,
                'output_asset_id' => $result->assetId,
                'alternatives' => $result->alternatives ?? [],
            ]);
            $this->info("Generation completed! Asset ID: {$result->assetId}");

            return self::SUCCESS;
        }

        $generation->update([
            'status' => GenerationStatus::Failed,
            'error_message' => $result->error,
        ]);
        $this->error("Generation failed: {$result->error}");

        return self::FAILURE;
    }

    protected function resumeAllStuck(FalAIService $falAI, FalClient $falClient): int
    {
        $stuck = Generation::where('status', GenerationStatus::Processing)
            ->whereNotNull('fal_request_id')
            ->get();

        if ($stuck->isEmpty()) {
            $this->info('No stuck generations found.');

            return self::SUCCESS;
        }

        $this->info("Found {$stuck->count()} stuck generation(s).");

        foreach ($stuck as $generation) {
            $this->line("\nProcessing Generation #{$generation->id}...");

            $result = $falAI->resumeGeneration($generation);

            if ($result->success) {
                $generation->update([
                    'status' => GenerationStatus::Completed,
                    'output_asset_id' => $result->assetId,
                    'alternatives' => $result->alternatives ?? [],
                ]);
                $this->info("  Completed! Asset ID: {$result->assetId}");
            } else {
                $generation->update([
                    'status' => GenerationStatus::Failed,
                    'error_message' => $result->error,
                ]);
                $this->error("  Failed: {$result->error}");
            }
        }

        return self::SUCCESS;
    }
}
