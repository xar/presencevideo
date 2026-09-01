<?php

use App\Models\Project;
use App\Models\User;

it('allows video tracks to contain image and shape clips', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $videoTracks = [
        [
            'id' => fake()->uuid(),
            'name' => 'Video Track 1',
            'visible' => true,
            'clips' => [
                [
                    'id' => fake()->uuid(),
                    'type' => 'image',
                    'asset_id' => 12,
                    'start_ms' => 0,
                    'duration_ms' => 3000,
                    'x' => 0,
                    'y' => 0,
                    'width' => 400,
                    'height' => 300,
                ],
                [
                    'id' => fake()->uuid(),
                    'type' => 'shape',
                    'shape' => 'ellipse',
                    'fill_color' => '#ff0000',
                    'border_color' => '#000000',
                    'border_width' => 4,
                    'corner_radius' => 0,
                    'start_ms' => 1000,
                    'duration_ms' => 2000,
                    'x' => 50,
                    'y' => 60,
                    'width' => 200,
                    'height' => 200,
                ],
            ],
        ],
    ];

    $this->actingAs($user)
        ->put(route('editor.projects.update', $project), ['video_tracks' => $videoTracks])
        ->assertRedirect();

    $clips = $project->refresh()->video_tracks[0]['clips'];

    expect($clips)->toHaveCount(2)
        ->and($clips[0]['type'])->toBe('image')
        ->and($clips[0]['asset_id'])->toBe(12)
        ->and($clips[1]['type'])->toBe('shape')
        ->and($clips[1]['shape'])->toBe('ellipse')
        ->and($clips[1]['fill_color'])->toBe('#ff0000');
});

it('rejects unknown shape kinds and clip types on video tracks', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $track = fn (array $clip) => [[
        'id' => fake()->uuid(),
        'name' => 'Video Track 1',
        'clips' => [['id' => fake()->uuid(), 'start_ms' => 0, 'duration_ms' => 1000] + $clip],
    ]];

    $this->actingAs($user)
        ->put(route('editor.projects.update', $project), ['video_tracks' => $track(['type' => 'shape', 'shape' => 'triangle'])])
        ->assertSessionHasErrors('video_tracks.0.clips.0.shape');

    $this->actingAs($user)
        ->put(route('editor.projects.update', $project), ['video_tracks' => $track(['type' => 'sticker'])])
        ->assertSessionHasErrors('video_tracks.0.clips.0.type');

    $this->actingAs($user)
        ->put(route('editor.projects.update', $project), ['video_tracks' => $track(['type' => 'image'])])
        ->assertSessionHasErrors('video_tracks.0.clips.0.asset_id');
});

it('validates scene layers with the same element rules as overlay clips', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $scene = fn (array $layer) => [[
        'id' => fake()->uuid(),
        'duration_ms' => 1000,
        'layers' => [['id' => fake()->uuid(), 'x' => 0, 'y' => 0, 'width' => 10, 'height' => 10, 'z_index' => 0] + $layer],
    ]];

    $this->actingAs($user)
        ->put(route('editor.projects.update', $project), ['scenes' => $scene(['type' => 'sticker'])])
        ->assertSessionHasErrors('scenes.0.layers.0.type');

    $this->actingAs($user)
        ->put(route('editor.projects.update', $project), ['scenes' => $scene(['type' => 'image'])])
        ->assertSessionHasErrors('scenes.0.layers.0.asset_id');

    $this->actingAs($user)
        ->put(route('editor.projects.update', $project), ['scenes' => $scene(['type' => 'shape', 'shape' => 'ellipse', 'fill_color' => '#ff0000'])])
        ->assertSessionHasNoErrors();
});
