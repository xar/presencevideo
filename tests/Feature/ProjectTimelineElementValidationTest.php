<?php

use App\Models\Project;
use App\Models\User;

/**
 * @param  array<string, mixed>  $layerOverrides
 * @return array<int, array<string, mixed>>
 */
function scenesWithTimelineLayer(array $layerOverrides): array
{
    return [[
        'id' => fake()->uuid(),
        'duration_ms' => 4000,
        'layers' => [array_merge([
            'id' => fake()->uuid(),
            'type' => 'text',
            'text' => 'Hello',
            'x' => 0,
            'y' => 0,
            'width' => 320,
            'height' => 180,
            'z_index' => 0,
        ], $layerOverrides)],
    ]];
}

test('a layer can carry absolute timing, a track id and keyframes', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);
    $trackId = fake()->uuid();

    $keyframes = [
        'x' => [
            ['time_ms' => 0, 'value' => 0, 'easing' => 'ease-in-out'],
            ['time_ms' => 900, 'value' => 320, 'easing' => [0.4, 0, 0.2, 1]],
        ],
        'adjustments.brightness' => [['time_ms' => 0, 'value' => -0.25]],
    ];

    $this->actingAs($user)
        ->put(route('editor.projects.update', $project), [
            'scenes' => scenesWithTimelineLayer([
                'start_ms' => 500,
                'end_ms' => 1500,
                'track_id' => $trackId,
                'keyframes' => $keyframes,
            ]),
        ])
        ->assertRedirect()
        ->assertSessionHasNoErrors();

    $layer = $project->refresh()->scenes[0]['layers'][0];

    expect($layer['start_ms'])->toBe(500)
        ->and($layer['end_ms'])->toBe(1500)
        ->and($layer['track_id'])->toBe($trackId)
        ->and($layer['keyframes'])->toBe($keyframes);
});

test('scenes no longer require a duration', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $scenes = scenesWithTimelineLayer([]);
    unset($scenes[0]['duration_ms']);

    $this->actingAs($user)
        ->put(route('editor.projects.update', $project), ['scenes' => $scenes])
        ->assertRedirect()
        ->assertSessionHasNoErrors();

    expect($project->refresh()->scenes[0]['layers'][0]['end_ms'])->toBe(Project::DEFAULT_SCENE_DURATION_MS);
});

test('a media layer fit defaults to cover and rejects an unsupported value', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $this->actingAs($user)
        ->put(route('editor.projects.update', $project), [
            'scenes' => scenesWithTimelineLayer(['type' => 'image', 'asset_id' => 7, 'text' => null]),
        ])
        ->assertRedirect()
        ->assertSessionHasNoErrors();

    expect($project->refresh()->scenes[0]['layers'][0]['fit'])->toBe('cover');

    $this->actingAs($user)
        ->put(route('editor.projects.update', $project), [
            'scenes' => scenesWithTimelineLayer(['type' => 'image', 'asset_id' => 7, 'text' => null, 'fit' => 'stretch']),
        ])
        ->assertSessionHasErrors('scenes.0.layers.0.fit');
});

test('a negative start_ms is rejected', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $this->actingAs($user)
        ->put(route('editor.projects.update', $project), [
            'scenes' => scenesWithTimelineLayer(['start_ms' => -1]),
        ])
        ->assertSessionHasErrors('scenes.0.layers.0.start_ms');
});

dataset('invalid keyframes', [
    'unknown property path' => [['wobble' => [['time_ms' => 0, 'value' => 1]]], 'unsupported animated property [wobble]'],
    'negative time' => [['x' => [['time_ms' => -5, 'value' => 1]]], 'time_ms field must be an integer of at least 0'],
    'non integer time' => [['x' => [['time_ms' => 1.5, 'value' => 1]]], 'time_ms field must be an integer of at least 0'],
    'non numeric value' => [['x' => [['time_ms' => 0, 'value' => 'wide']]], 'value field must be numeric'],
    'missing value' => [['x' => [['time_ms' => 0]]], 'value field must be numeric'],
    'bad easing name' => [['x' => [['time_ms' => 0, 'value' => 1, 'easing' => 'springy']]], 'easing field must be one of'],
    'short cubic bezier' => [['x' => [['time_ms' => 0, 'value' => 1, 'easing' => [0.4, 0, 0.2]]]], 'cubic-bezier array of exactly four numbers'],
    'long cubic bezier' => [['x' => [['time_ms' => 0, 'value' => 1, 'easing' => [0.4, 0, 0.2, 1, 1]]]], 'cubic-bezier array of exactly four numbers'],
    'non numeric cubic bezier' => [['x' => [['time_ms' => 0, 'value' => 1, 'easing' => [0.4, 0, 0.2, 'x']]]], 'cubic-bezier array of exactly four numbers'],
    'track is not a list' => [['x' => 'nope'], 'must be a list of keyframes'],
    'keyframe is not an object' => [['x' => ['nope']], 'must be a keyframe object'],
]);

test('invalid keyframes are rejected for the right reason', function (array $keyframes, string $expectedMessage) {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $this->actingAs($user)
        ->put(route('editor.projects.update', $project), [
            'scenes' => scenesWithTimelineLayer(['keyframes' => $keyframes]),
        ])
        ->assertSessionHasErrors('scenes.0.layers.0.keyframes');

    $errors = session('errors')->get('scenes.0.layers.0.keyframes');

    expect(implode(' ', $errors))->toContain($expectedMessage);

    expect($project->refresh()->scenes)->toBe([]);
})->with('invalid keyframes');

test('video track clips accept absolute timing without a duration', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $this->actingAs($user)
        ->put(route('editor.projects.update', $project), [
            'video_tracks' => [[
                'id' => fake()->uuid(),
                'name' => 'Overlay',
                'clips' => [[
                    'id' => fake()->uuid(),
                    'type' => 'text',
                    'text' => 'Clip',
                    'start_ms' => 1000,
                    'end_ms' => 2500,
                ]],
            ]],
        ])
        ->assertRedirect()
        ->assertSessionHasNoErrors();

    expect($project->refresh()->video_tracks[0]['clips'][0])
        ->toMatchArray(['start_ms' => 1000, 'end_ms' => 2500]);
});
