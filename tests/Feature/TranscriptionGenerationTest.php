<?php

use App\Enums\GenerationStatus;
use App\Enums\GenerationType;
use App\Jobs\RunGeneration;
use App\Models\Asset;
use App\Models\Project;
use App\Models\User;
use Illuminate\Support\Facades\Queue;

test('users can create a speech_to_text generation', function () {
    Queue::fake();

    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);
    $asset = Asset::factory()->audio()->forProject($project)->create();

    $response = $this->actingAs($user)->postJson(
        route('editor.generations.store', [$project, 'speech_to_text']),
        [
            'input_asset_id' => $asset->id,
        ]
    );

    $response->assertCreated();
    $response->assertJsonPath('generation.type', 'speech_to_text');

    $this->assertDatabaseHas('generations', [
        'project_id' => $project->id,
        'type' => GenerationType::SpeechToText->value,
        'status' => GenerationStatus::Pending->value,
        'input_asset_id' => $asset->id,
        'model' => 'fal-ai/wizper',
    ]);

    Queue::assertPushed(RunGeneration::class);
});

test('speech_to_text requires input_asset_id', function () {
    Queue::fake();

    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $response = $this->actingAs($user)->postJson(
        route('editor.generations.store', [$project, 'speech_to_text']),
        [
            'prompt' => 'test',
        ]
    );

    $response->assertUnprocessable();
    $response->assertJsonValidationErrors('input_asset_id');

    Queue::assertNotPushed(RunGeneration::class);
});

test('speech_to_text does not require prompt', function () {
    Queue::fake();

    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);
    $asset = Asset::factory()->video()->forProject($project)->create();

    $response = $this->actingAs($user)->postJson(
        route('editor.generations.store', [$project, 'speech_to_text']),
        [
            'input_asset_id' => $asset->id,
        ]
    );

    $response->assertCreated();

    Queue::assertPushed(RunGeneration::class);
});

test('speech_to_text works with video assets', function () {
    Queue::fake();

    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);
    $asset = Asset::factory()->video()->forProject($project)->create();

    $response = $this->actingAs($user)->postJson(
        route('editor.generations.store', [$project, 'speech_to_text']),
        [
            'input_asset_id' => $asset->id,
        ]
    );

    $response->assertCreated();
    $response->assertJsonPath('generation.type', 'speech_to_text');
});
