<?php

use App\Models\Project;
use App\Models\User;

test('users can create a project with a resolution preset', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->post(route('editor.projects.store'), [
        'name' => 'Landscape Video',
        'resolution_width' => 1920,
        'resolution_height' => 1080,
    ]);

    $response->assertRedirect();

    $this->assertDatabaseHas('projects', [
        'user_id' => $user->id,
        'name' => 'Landscape Video',
        'resolution_width' => 1920,
        'resolution_height' => 1080,
    ]);
});

test('project defaults to portrait resolution when none specified', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->post(route('editor.projects.store'), [
        'name' => 'Default Resolution',
    ]);

    $response->assertRedirect();

    $this->assertDatabaseHas('projects', [
        'user_id' => $user->id,
        'name' => 'Default Resolution',
        'resolution_width' => 1080,
        'resolution_height' => 1920,
    ]);
});

test('users can update project resolution', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $response = $this->actingAs($user)->put(route('editor.projects.update', $project), [
        'resolution_width' => 3840,
        'resolution_height' => 2160,
    ]);

    $response->assertRedirect();

    $project->refresh();
    expect($project->resolution_width)->toBe(3840);
    expect($project->resolution_height)->toBe(2160);
});

test('resolution width must be within valid range', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->post(route('editor.projects.store'), [
        'name' => 'Invalid Resolution',
        'resolution_width' => 50,
        'resolution_height' => 1080,
    ]);

    $response->assertSessionHasErrors('resolution_width');
});

test('resolution height must be within valid range', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->post(route('editor.projects.store'), [
        'name' => 'Invalid Resolution',
        'resolution_width' => 1920,
        'resolution_height' => 10000,
    ]);

    $response->assertSessionHasErrors('resolution_height');
});
