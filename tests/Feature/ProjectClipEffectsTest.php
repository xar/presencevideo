<?php

use App\Models\Project;
use App\Models\User;

/**
 * @param  array<string, mixed>  $layerOverrides
 * @return array<int, array<string, mixed>>
 */
function scenesWithVideoLayer(array $layerOverrides): array
{
    return [[
        'id' => fake()->uuid(),
        'duration_ms' => 5000,
        'layers' => [array_merge([
            'id' => fake()->uuid(),
            'type' => 'video',
            'asset_id' => 1,
            'x' => 0,
            'y' => 0,
            'width' => 1920,
            'height' => 1080,
            'z_index' => 0,
        ], $layerOverrides)],
    ]];
}

/**
 * @param  array<string, mixed>  $clipOverrides
 * @return array<int, array<string, mixed>>
 */
function videoTracksWithClip(array $clipOverrides): array
{
    return [[
        'id' => fake()->uuid(),
        'name' => 'Overlay',
        'clips' => [array_merge([
            'id' => fake()->uuid(),
            'type' => 'video',
            'asset_id' => 1,
            'start_ms' => 0,
            'duration_ms' => 2000,
            'x' => 0,
            'y' => 0,
            'width' => 320,
            'height' => 180,
            'z_index' => 0,
        ], $clipOverrides)],
    ]];
}

test('users can save a speed multiplier on a scene video layer', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $this->actingAs($user)
        ->put(route('editor.projects.update', $project), [
            'scenes' => scenesWithVideoLayer(['speed' => 2.5]),
        ])
        ->assertRedirect();

    expect($project->refresh()->scenes[0]['layers'][0]['speed'])->toBe(2.5);
});

test('users can save a volume and mute flag on a scene video layer', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $this->actingAs($user)
        ->put(route('editor.projects.update', $project), [
            'scenes' => scenesWithVideoLayer(['volume' => 0.4, 'muted' => true]),
        ])
        ->assertRedirect();

    $layer = $project->refresh()->scenes[0]['layers'][0];

    expect($layer['volume'])->toBe(0.4)
        ->and($layer['muted'])->toBeTrue();
});

test('a layer volume outside 0..1 is rejected', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $this->actingAs($user)
        ->put(route('editor.projects.update', $project), [
            'scenes' => scenesWithVideoLayer(['volume' => 1.5]),
        ])
        ->assertSessionHasErrors('scenes.0.layers.0.volume');

    $this->actingAs($user)
        ->put(route('editor.projects.update', $project), [
            'scenes' => scenesWithVideoLayer(['volume' => -0.2]),
        ])
        ->assertSessionHasErrors('scenes.0.layers.0.volume');
});

test('a layer speed outside the supported range is rejected', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $this->actingAs($user)
        ->put(route('editor.projects.update', $project), [
            'scenes' => scenesWithVideoLayer(['speed' => 8]),
        ])
        ->assertSessionHasErrors('scenes.0.layers.0.speed');

    $this->actingAs($user)
        ->put(route('editor.projects.update', $project), [
            'scenes' => scenesWithVideoLayer(['speed' => 0.1]),
        ])
        ->assertSessionHasErrors('scenes.0.layers.0.speed');
});

test('users can save colour adjustments on a scene layer', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $this->actingAs($user)
        ->put(route('editor.projects.update', $project), [
            'scenes' => scenesWithVideoLayer([
                'adjustments' => ['brightness' => -0.4, 'contrast' => 1.6, 'saturation' => 0.2],
            ]),
        ])
        ->assertRedirect();

    expect($project->refresh()->scenes[0]['layers'][0]['adjustments'])
        ->toBe(['brightness' => -0.4, 'contrast' => 1.6, 'saturation' => 0.2]);
});

test('out of range colour adjustments are rejected', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $this->actingAs($user)
        ->put(route('editor.projects.update', $project), [
            'scenes' => scenesWithVideoLayer(['adjustments' => ['brightness' => 2]]),
        ])
        ->assertSessionHasErrors('scenes.0.layers.0.adjustments.brightness');

    $this->actingAs($user)
        ->put(route('editor.projects.update', $project), [
            'scenes' => scenesWithVideoLayer(['adjustments' => ['saturation' => 3]]),
        ])
        ->assertSessionHasErrors('scenes.0.layers.0.adjustments.saturation');
});

test('users can save a speed multiplier on an overlay video clip', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $this->actingAs($user)
        ->put(route('editor.projects.update', $project), [
            'video_tracks' => videoTracksWithClip(['speed' => 0.25]),
        ])
        ->assertRedirect();

    expect($project->refresh()->video_tracks[0]['clips'][0]['speed'])->toBe(0.25);
});

test('an overlay clip speed outside the supported range is rejected', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $this->actingAs($user)
        ->put(route('editor.projects.update', $project), [
            'video_tracks' => videoTracksWithClip(['speed' => 5]),
        ])
        ->assertSessionHasErrors('video_tracks.0.clips.0.speed');
});
