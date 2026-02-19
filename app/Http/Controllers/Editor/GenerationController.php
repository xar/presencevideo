<?php

namespace App\Http\Controllers\Editor;

use App\Enums\GenerationStatus;
use App\Enums\GenerationType;
use App\Http\Controllers\Controller;
use App\Jobs\RunGeneration;
use App\Models\Generation;
use App\Models\Project;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class GenerationController extends Controller
{
    /**
     * Start a new generation.
     */
    public function store(Request $request, Project $project, string $type): JsonResponse
    {
        $this->authorize('update', $project);

        $generationType = GenerationType::from($type);

        $validated = $request->validate([
            'prompt' => ['required', 'string', 'max:2000'],
            'scene_id' => ['nullable', 'string', 'uuid'],
            'step_index' => ['nullable', 'integer', 'min:0'],
            'input_asset_id' => ['nullable', 'exists:assets,id'],
            'parameters' => ['nullable', 'array'],
        ]);

        $model = match ($generationType) {
            GenerationType::TextToImage => 'fal-ai/flux/schnell',
            GenerationType::ImageToVideo => 'fal-ai/kling-video/v1.5/pro/image-to-video',
            GenerationType::TextToMusic => 'fal-ai/stable-audio',
            GenerationType::TextToSpeech => 'fal-ai/f5-tts',
            GenerationType::TextToSfx => 'fal-ai/stable-audio',
        };

        $generation = Generation::create([
            'user_id' => $request->user()->id,
            'project_id' => $project->id,
            'scene_id' => $validated['scene_id'] ?? null,
            'step_index' => $validated['step_index'] ?? null,
            'type' => $generationType,
            'provider' => 'fal',
            'model' => $model,
            'prompt' => $validated['prompt'],
            'input_asset_id' => $validated['input_asset_id'] ?? null,
            'parameters' => $validated['parameters'] ?? [],
            'status' => GenerationStatus::Pending,
        ]);

        RunGeneration::dispatch($generation);

        return response()->json([
            'generation' => $generation,
        ], 201);
    }

    /**
     * Get the status of a generation.
     */
    public function show(Request $request, Generation $generation): JsonResponse
    {
        $this->authorize('view', $generation);

        $generation->load(['outputAsset']);

        return response()->json([
            'generation' => $generation,
        ]);
    }
}
