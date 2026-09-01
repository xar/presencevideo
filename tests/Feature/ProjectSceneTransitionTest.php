<?php

use App\Models\Project;
use App\Models\User;

/**
 * @param  array<string, mixed>|null  $transition
 * @return array<string, mixed>
 */
function sceneWithTransition(?array $transition = null): array
{
    $scene = [
        'id' => fake()->uuid(),
        'duration_ms' => 5000,
        'layers' => [],
    ];

    if ($transition !== null) {
        $scene['transition'] = $transition;
    }

    return $scene;
}

test('users can save a scene transition', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $scenes = [
        sceneWithTransition(['type' => 'slideleft', 'duration_ms' => 600]),
        sceneWithTransition(),
    ];

    $this->actingAs($user)
        ->put(route('editor.projects.update', $project), ['scenes' => $scenes])
        ->assertRedirect();

    $project->refresh();

    expect($project->scenes[0]['transition'])->toBe(['type' => 'slideleft', 'duration_ms' => 600])
        ->and($project->scenes[1])->not->toHaveKey('transition');
});

test('a scene transition can be removed with null', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create([
        'user_id' => $user->id,
        'scenes' => [sceneWithTransition(['type' => 'fade', 'duration_ms' => 500]), sceneWithTransition()],
    ]);

    $scenes = $project->scenes;
    $scenes[0]['transition'] = null;

    $this->actingAs($user)
        ->put(route('editor.projects.update', $project), ['scenes' => $scenes])
        ->assertRedirect();

    expect($project->refresh()->scenes[0]['transition'])->toBeNull();
});

test('an unknown transition type is rejected', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $this->actingAs($user)
        ->put(route('editor.projects.update', $project), [
            'scenes' => [sceneWithTransition(['type' => 'explode', 'duration_ms' => 500]), sceneWithTransition()],
        ])
        ->assertSessionHasErrors('scenes.0.transition.type');
});

test('a transition longer than the maximum is rejected', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $this->actingAs($user)
        ->put(route('editor.projects.update', $project), [
            'scenes' => [sceneWithTransition(['type' => 'fade', 'duration_ms' => 5000]), sceneWithTransition()],
        ])
        ->assertSessionHasErrors('scenes.0.transition.duration_ms');
});

test('a transition without a type is rejected', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $this->actingAs($user)
        ->put(route('editor.projects.update', $project), [
            'scenes' => [sceneWithTransition(['duration_ms' => 500]), sceneWithTransition()],
        ])
        ->assertSessionHasErrors('scenes.0.transition.type');
});
