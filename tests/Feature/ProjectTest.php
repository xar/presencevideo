<?php

use App\Enums\ProjectStatus;
use App\Models\Generation;
use App\Models\Project;
use App\Models\User;

test('guests cannot access the editor', function () {
    $response = $this->get(route('editor.index'));
    $response->assertRedirect(route('login'));
});

test('authenticated users can view the editor index', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->get(route('editor.index'));

    $response->assertOk();
    $response->assertInertia(fn ($page) => $page->component('editor/Index'));
});

test('users can create a project', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->post(route('editor.projects.store'), [
        'name' => 'Test Project',
    ]);

    $response->assertRedirect();

    $this->assertDatabaseHas('projects', [
        'user_id' => $user->id,
        'name' => 'Test Project',
        'status' => ProjectStatus::Draft->value,
    ]);
});

test('project name is required', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->post(route('editor.projects.store'), [
        'name' => '',
    ]);

    $response->assertSessionHasErrors('name');
});

test('users can view their own project', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $response = $this->actingAs($user)->get(route('editor.projects.show', $project));

    $response->assertOk();
    $response->assertInertia(fn ($page) => $page
        ->component('editor/Show')
        ->has('project')
    );
});

test('users cannot view other users projects', function () {
    $user = User::factory()->create();
    $otherUser = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $otherUser->id]);

    $response = $this->actingAs($user)->get(route('editor.projects.show', $project));

    $response->assertForbidden();
});

test('users can update their project', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $response = $this->actingAs($user)->put(route('editor.projects.update', $project), [
        'name' => 'Updated Name',
        'resolution_width' => 1920,
        'resolution_height' => 1080,
    ]);

    $response->assertRedirect();

    $this->assertDatabaseHas('projects', [
        'id' => $project->id,
        'name' => 'Updated Name',
        'resolution_width' => 1920,
        'resolution_height' => 1080,
    ]);
});

test('users can update project scenes', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $sceneId = fake()->uuid();
    $scenes = [
        [
            'id' => $sceneId,
            'duration_ms' => 5000,
            'layers' => [],
        ],
    ];

    $response = $this->actingAs($user)->put(route('editor.projects.update', $project), [
        'scenes' => $scenes,
    ]);

    $response->assertRedirect();

    $project->refresh();
    expect($project->scenes)->toHaveCount(1);
    expect($project->scenes[0]['id'])->toBe($sceneId);
    expect($project->scenes[0]['duration_ms'])->toBe(5000);
});

test('users can delete their project', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $response = $this->actingAs($user)->delete(route('editor.projects.destroy', $project));

    $response->assertRedirect(route('editor.index'));

    $this->assertDatabaseMissing('projects', ['id' => $project->id]);
});

test('users cannot delete other users projects', function () {
    $user = User::factory()->create();
    $otherUser = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $otherUser->id]);

    $response = $this->actingAs($user)->delete(route('editor.projects.destroy', $project));

    $response->assertForbidden();

    $this->assertDatabaseHas('projects', ['id' => $project->id]);
});

test('project has default resolution and fps', function () {
    $project = Project::factory()->create();

    expect($project->resolution_width)->toBe(1080);
    expect($project->resolution_height)->toBe(1920);
    expect($project->fps)->toBe(30);
});

test('project scenes and audio tracks default to empty arrays', function () {
    $project = Project::factory()->create();

    expect($project->scenes)->toBe([]);
    expect($project->audio_tracks)->toBe([]);
});

test('project show includes active generations', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    // Create pending and processing generations (should be included)
    $pending = Generation::factory()->forProject($project)->create();
    $processing = Generation::factory()->forProject($project)->processing()->create();

    // Create completed and failed generations (should NOT be included)
    Generation::factory()->forProject($project)->completed()->create();
    Generation::factory()->forProject($project)->failed()->create();

    $response = $this->actingAs($user)->get(route('editor.projects.show', $project));

    $response->assertOk();
    $response->assertInertia(fn ($page) => $page
        ->component('editor/Show')
        ->has('activeGenerations', 2)
    );
});
