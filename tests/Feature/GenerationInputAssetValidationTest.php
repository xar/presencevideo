<?php

use App\Jobs\RunGeneration;
use App\Models\Asset;
use App\Models\Project;
use App\Models\User;
use Illuminate\Support\Facades\Queue;

it('allows image to video generation from a selected project image asset', function () {
    Queue::fake();

    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);
    $asset = Asset::factory()->forProject($project)->create();

    $response = $this->actingAs($user)->postJson(
        route('editor.generations.store', [$project, 'image_to_video']),
        [
            'prompt' => 'Slow cinematic camera push in',
            'input_asset_id' => $asset->id,
        ]
    );

    $response->assertCreated();
    $response->assertJsonPath('generation.input_asset_id', $asset->id);

    Queue::assertPushed(RunGeneration::class);
});

it('rejects image to video generation with assets outside the project', function () {
    Queue::fake();

    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);
    $otherProject = Project::factory()->create(['user_id' => $user->id]);
    $asset = Asset::factory()->forProject($otherProject)->create();

    $response = $this->actingAs($user)->postJson(
        route('editor.generations.store', [$project, 'image_to_video']),
        [
            'prompt' => 'Slow cinematic camera push in',
            'input_asset_id' => $asset->id,
        ]
    );

    $response->assertUnprocessable();
    $response->assertJsonValidationErrors('input_asset_id');

    Queue::assertNotPushed(RunGeneration::class);
});

it('rejects image to video generation with non image assets', function () {
    Queue::fake();

    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);
    $asset = Asset::factory()->video()->forProject($project)->create();

    $response = $this->actingAs($user)->postJson(
        route('editor.generations.store', [$project, 'image_to_video']),
        [
            'prompt' => 'Slow cinematic camera push in',
            'input_asset_id' => $asset->id,
        ]
    );

    $response->assertUnprocessable();
    $response->assertJsonValidationErrors('input_asset_id');

    Queue::assertNotPushed(RunGeneration::class);
});
