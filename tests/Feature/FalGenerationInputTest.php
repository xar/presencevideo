<?php

use App\Ai\Tools\GenerateFalAsset;
use App\Enums\GenerationType;
use App\Models\Generation;
use App\Models\Project;
use App\Models\User;
use App\Services\FalAIService;
use Illuminate\Support\Facades\Queue;
use Laravel\Ai\Tools\Request;

function invokeOnFalService(string $method, array $arguments): mixed
{
    $service = app(FalAIService::class);
    $reflection = new ReflectionMethod($service, $method);

    return $reflection->invokeArgs($service, $arguments);
}

function imageModelConfig(): array
{
    return [
        'id' => 'openai/gpt-image-2.5/sunburst/text-to-image',
        'name' => 'Sunburst',
        'description' => '',
        'parameters' => [
            'image_size' => [
                'type' => 'select',
                'options' => [
                    'square_hd' => 'Square hd',
                    'portrait_16_9' => 'Portrait 16 9',
                    'landscape_4_3' => 'Landscape 4 3',
                ],
            ],
        ],
        'defaults' => ['image_size' => 'landscape_4_3', 'quality' => 'high'],
    ];
}

function generationWith(array $parameters): Generation
{
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    return Generation::make([
        'user_id' => $user->id,
        'project_id' => $project->id,
        'type' => GenerationType::TextToImage,
        'provider' => 'fal',
        'prompt' => 'a storm at sea',
        'parameters' => $parameters,
    ]);
}

it('translates a requested aspect ratio onto the image_size the model exposes', function () {
    $input = invokeOnFalService('buildModelInput', [
        generationWith(['aspect_ratio' => '9:16']),
        imageModelConfig(),
    ]);

    expect($input['image_size'])->toBe('portrait_16_9')
        ->and($input)->not->toHaveKey('aspect_ratio');
});

it('overrides the model default image_size rather than losing to it', function () {
    $input = invokeOnFalService('buildModelInput', [
        generationWith(['aspect_ratio' => '9:16']),
        imageModelConfig(),
    ]);

    expect($input['image_size'])->not->toBe('landscape_4_3');
});

it('leaves aspect_ratio alone for a model that accepts it directly', function () {
    $config = imageModelConfig();
    $config['parameters']['aspect_ratio'] = ['type' => 'select', 'options' => ['9:16' => '9:16']];

    $input = invokeOnFalService('buildModelInput', [
        generationWith(['aspect_ratio' => '9:16']),
        $config,
    ]);

    expect($input['aspect_ratio'])->toBe('9:16')
        ->and($input['image_size'])->toBe('landscape_4_3');
});

it('leaves the request untouched for a catalog model with no known schema', function () {
    $input = invokeOnFalService('buildModelInput', [
        generationWith(['aspect_ratio' => '9:16']),
        ['id' => 'vendor/unknown', 'name' => '', 'description' => '', 'parameters' => [], 'defaults' => []],
    ]);

    expect($input['aspect_ratio'])->toBe('9:16')
        ->and($input)->not->toHaveKey('image_size');
});

it('does not map an aspect ratio the model has no bucket for', function () {
    $input = invokeOnFalService('buildModelInput', [
        generationWith(['aspect_ratio' => '21:9']),
        imageModelConfig(),
    ]);

    expect($input['aspect_ratio'])->toBe('21:9')
        ->and($input['image_size'])->toBe('landscape_4_3');
});

it('strips internal bookkeeping keys from the fal payload', function () {
    $input = invokeOnFalService('buildModelInput', [
        generationWith([
            'model_key' => 'openai/gpt-image-2.5/sunburst/text-to-image',
            'agent_activity_id' => 86,
            'agent_conversation_id' => '1d6a89c1-1129-4838-b13b-006873e6ca09',
            'transcription_text' => 'previously transcribed',
            'transcription_chunks' => [['text' => 'hi']],
            'quality' => 'high',
        ]),
        imageModelConfig(),
    ]);

    expect($input)->not->toHaveKeys([
        'model_key',
        'agent_activity_id',
        'agent_conversation_id',
        'transcription_text',
        'transcription_chunks',
    ])->and($input['quality'])->toBe('high')
        ->and($input['prompt'])->toBe('a storm at sea');
});

it('sends the prompt under the field name the model wants', function () {
    $input = invokeOnFalService('buildModelInput', [
        generationWith([]),
        ['id' => 'fal-ai/f5-tts', 'name' => '', 'description' => '', 'parameters' => [], 'defaults' => []],
        [],
        'gen_text',
    ]);

    expect($input['gen_text'])->toBe('a storm at sea')
        ->and($input)->not->toHaveKey('prompt');
});

it('defaults a visual generation to the project canvas aspect ratio', function () {
    Queue::fake();
    $user = User::factory()->create();
    $project = Project::factory()->create([
        'user_id' => $user->id,
        'resolution_width' => 1080,
        'resolution_height' => 1920,
    ]);

    (new GenerateFalAsset($user, null))->handle(new Request([
        'project_id' => $project->id,
        'type' => 'text_to_image',
        'prompt' => 'a storm at sea',
        'model_id' => 'openai/gpt-image-2.5/sunburst/text-to-image',
    ]));

    expect(Generation::latest('id')->first()->parameters['aspect_ratio'])->toBe('9:16');
});

it('does not override an aspect ratio the agent chose explicitly', function () {
    Queue::fake();
    $user = User::factory()->create();
    $project = Project::factory()->create([
        'user_id' => $user->id,
        'resolution_width' => 1080,
        'resolution_height' => 1920,
    ]);

    (new GenerateFalAsset($user, null))->handle(new Request([
        'project_id' => $project->id,
        'type' => 'text_to_image',
        'prompt' => 'a storm at sea',
        'model_id' => 'openai/gpt-image-2.5/sunburst/text-to-image',
        'parameters_json' => '{"aspect_ratio":"1:1"}',
    ]));

    expect(Generation::latest('id')->first()->parameters['aspect_ratio'])->toBe('1:1');
});

it('leaves audio generations without an aspect ratio', function () {
    Queue::fake();
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    (new GenerateFalAsset($user, null))->handle(new Request([
        'project_id' => $project->id,
        'type' => 'text_to_music',
        'prompt' => 'cinematic score',
        'model_id' => 'sonilo/v1.1/text-to-music',
    ]));

    expect(Generation::latest('id')->first()->parameters)->not->toHaveKey('aspect_ratio');
});
