<?php

use App\Models\Project;
use App\Models\User;

test('project subtitle_tracks defaults to empty array', function () {
    $project = Project::factory()->create();

    expect($project->subtitle_tracks)->toBe([]);
});

test('users can save subtitle tracks on project', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $trackId = fake()->uuid();
    $entryId = fake()->uuid();

    $subtitleTracks = [
        [
            'id' => $trackId,
            'name' => 'Subtitles 1',
            'enabled' => true,
            'style' => [
                'font_size' => 48,
                'font_color' => '#ffffff',
                'background_color' => '#00000080',
                'position' => 'bottom',
            ],
            'entries' => [
                [
                    'id' => $entryId,
                    'start_ms' => 0,
                    'end_ms' => 3000,
                    'text' => 'Hello world',
                ],
            ],
        ],
    ];

    $response = $this->actingAs($user)->put(route('editor.projects.update', $project), [
        'subtitle_tracks' => $subtitleTracks,
    ]);

    $response->assertRedirect();

    $project->refresh();
    expect($project->subtitle_tracks)->toHaveCount(1);
    expect($project->subtitle_tracks[0]['id'])->toBe($trackId);
    expect($project->subtitle_tracks[0]['name'])->toBe('Subtitles 1');
    expect($project->subtitle_tracks[0]['entries'])->toHaveCount(1);
    expect($project->subtitle_tracks[0]['entries'][0]['text'])->toBe('Hello world');
});

test('subtitle track validation requires uuid for id', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $response = $this->actingAs($user)->put(route('editor.projects.update', $project), [
        'subtitle_tracks' => [
            [
                'id' => 'not-a-uuid',
                'name' => 'Test',
            ],
        ],
    ]);

    $response->assertSessionHasErrors('subtitle_tracks.0.id');
});

test('subtitle track position must be top or bottom', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $response = $this->actingAs($user)->put(route('editor.projects.update', $project), [
        'subtitle_tracks' => [
            [
                'id' => fake()->uuid(),
                'name' => 'Test',
                'style' => [
                    'position' => 'middle',
                ],
            ],
        ],
    ]);

    $response->assertSessionHasErrors('subtitle_tracks.0.style.position');
});

test('subtitle tracks persist alongside other project data', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $sceneId = fake()->uuid();
    $trackId = fake()->uuid();
    $entryId = fake()->uuid();

    $response = $this->actingAs($user)->put(route('editor.projects.update', $project), [
        'name' => 'Updated Project',
        'scenes' => [
            [
                'id' => $sceneId,
                'duration_ms' => 5000,
                'layers' => [],
            ],
        ],
        'subtitle_tracks' => [
            [
                'id' => $trackId,
                'name' => 'My Subtitles',
                'enabled' => true,
                'style' => [
                    'font_size' => 36,
                    'font_color' => '#ffff00',
                    'background_color' => '#000000',
                    'position' => 'top',
                ],
                'entries' => [
                    [
                        'id' => $entryId,
                        'start_ms' => 1000,
                        'end_ms' => 4000,
                        'text' => 'Test subtitle',
                    ],
                ],
            ],
        ],
    ]);

    $response->assertRedirect();

    $project->refresh();
    expect($project->name)->toBe('Updated Project');
    expect($project->scenes)->toHaveCount(1);
    expect($project->subtitle_tracks)->toHaveCount(1);
    expect($project->subtitle_tracks[0]['style']['position'])->toBe('top');
});
