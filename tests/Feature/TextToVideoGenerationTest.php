<?php

use App\Enums\GenerationStatus;
use App\Enums\GenerationType;
use App\Jobs\RunGeneration;
use App\Models\Generation;
use App\Models\Project;
use App\Models\User;
use App\Services\FalAI\FalClient;
use App\Services\FalAI\ModelRegistry;
use App\Services\FalAIService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;

test('users can create a text_to_video generation without an input asset', function () {
    Queue::fake();

    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $response = $this->actingAs($user)->postJson(
        route('editor.generations.store', [$project, 'text_to_video']),
        [
            'prompt' => 'A drone shot over a snowy mountain range at sunrise',
            'model_id' => 'minimax/h3-max/text-to-video',
        ]
    );

    $response->assertCreated();
    $response->assertJsonPath('generation.type', 'text_to_video');

    $this->assertDatabaseHas('generations', [
        'project_id' => $project->id,
        'type' => GenerationType::TextToVideo->value,
        'status' => GenerationStatus::Pending->value,
        'model' => 'minimax/h3-max/text-to-video',
        'input_asset_id' => null,
    ]);

    Queue::assertPushed(RunGeneration::class);
});

test('text_to_video requires a prompt', function () {
    Queue::fake();

    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $this->actingAs($user)->postJson(
        route('editor.generations.store', [$project, 'text_to_video']),
        ['model_id' => 'minimax/h3-max/text-to-video']
    )->assertUnprocessable()->assertJsonValidationErrors('prompt');

    Queue::assertNotPushed(RunGeneration::class);
});

test('text_to_video sends the prompt without a source image', function () {
    $generation = Generation::factory()->create([
        'type' => GenerationType::TextToVideo,
        'model' => 'minimax/h3-max/text-to-video',
        'prompt' => 'A drone shot over a snowy mountain range at sunrise',
        'parameters' => ['model_key' => 'minimax/h3-max/text-to-video'],
    ]);

    $capturedInput = null;

    $client = Mockery::mock(FalClient::class);
    $client->shouldReceive('subscribe')
        ->once()
        ->andReturnUsing(function (string $modelId, array $input) use (&$capturedInput) {
            $capturedInput = $input;

            // No video in the response, so the result short-circuits before download.
            return [];
        });

    $registry = Mockery::mock(ModelRegistry::class);
    $registry->shouldReceive('getAllModels')->andReturn([]);

    $result = (new FalAIService($client, $registry))->generate($generation);

    expect($capturedInput)->toHaveKey('prompt')
        ->and($capturedInput['prompt'])->toBe('A drone shot over a snowy mountain range at sunrise')
        ->and($capturedInput)->not->toHaveKey('image_url')
        ->and($result->success)->toBeFalse()
        // Reaching this error proves the input-image guard was not applied.
        ->and($result->error)->toBe('No video generated');
});

test('image_to_video still requires a source image', function () {
    $generation = Generation::factory()->create([
        'type' => GenerationType::ImageToVideo,
        'model' => 'minimax/h3-max/image-to-video',
        'input_asset_id' => null,
    ]);

    $client = Mockery::mock(FalClient::class);
    $client->shouldNotReceive('subscribe');

    $registry = Mockery::mock(ModelRegistry::class);
    $registry->shouldReceive('getAllModels')->andReturn([]);

    $result = (new FalAIService($client, $registry))->generate($generation);

    expect($result->success)->toBeFalse()
        ->and($result->error)->toBe('Input image required for video generation');
});

test('the registry refetches when a cached payload predates a new generation type', function () {
    Cache::put('fal_models_registry_remote', [
        'text_to_image' => [['key' => 'stale-image-model']],
        'image_to_video' => [['key' => 'stale-video-model']],
        'text_to_music' => [],
        'text_to_speech' => [],
        'text_to_sfx' => [],
    ], 3600);

    Http::fake([
        'api.fal.ai/*' => Http::response(['models' => []]),
    ]);

    $models = (new ModelRegistry)->getAllModels();

    // The stale payload has no text_to_video key, so it must not be served as-is.
    expect($models)->toHaveKey('text_to_video')
        ->and($models['text_to_image'])->not->toBe([['key' => 'stale-image-model']]);
});
