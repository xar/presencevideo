<?php

namespace App\Ai\Tools;

use App\Enums\GenerationType;
use App\Services\FalAI\ModelRegistry;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

class ListFalModels implements Tool
{
    public function name(): string
    {
        return 'list_fal_models';
    }

    public function description(): Stringable|string
    {
        return 'List fal.ai generation models available to create assets for video projects. Supports text_to_image, image_to_video, text_to_video, text_to_music, text_to_speech, text_to_sfx, and speech_to_text.';
    }

    public function handle(Request $request): Stringable|string
    {
        $type = $request['type'] ?? null;

        if ($type === GenerationType::SpeechToText->value) {
            return json_encode(['models' => [[
                'id' => 'fal-ai/wizper',
                'key' => 'fal-ai/wizper',
                'name' => 'Wizper',
                'description' => 'Speech-to-text transcription for audio and video assets.',
                'parameters' => [],
                'defaults' => [],
            ]]], JSON_THROW_ON_ERROR);
        }

        $models = app(ModelRegistry::class)->getAllModels();

        if ($type !== null) {
            $models = [$type => $models[$type] ?? []];
        }

        return json_encode(['models' => $models], JSON_THROW_ON_ERROR);
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'type' => $schema->string(),
        ];
    }
}
