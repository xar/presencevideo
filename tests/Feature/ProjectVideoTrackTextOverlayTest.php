<?php

use App\Models\Project;
use App\Models\User;

it('allows video tracks to contain timed text overlays', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $clipId = fake()->uuid();
    $trackId = fake()->uuid();

    $videoTracks = [
        [
            'id' => $trackId,
            'name' => 'Video Track 1',
            'visible' => true,
            'clips' => [
                [
                    'id' => $clipId,
                    'type' => 'text',
                    'text' => 'Hello timeline',
                    'start_ms' => 1000,
                    'duration_ms' => 2500,
                    'x' => 100,
                    'y' => 200,
                    'width' => 600,
                    'height' => 120,
                    'font_size' => 48,
                    'font_color' => '#ffffff',
                ],
            ],
        ],
    ];

    $response = $this->actingAs($user)->put(route('editor.projects.update', $project), [
        'video_tracks' => $videoTracks,
    ]);

    $response->assertRedirect();

    $project->refresh();

    expect($project->video_tracks)->toHaveCount(1)
        ->and($project->video_tracks[0]['clips'][0]['type'])->toBe('text')
        ->and($project->video_tracks[0]['clips'][0]['text'])->toBe('Hello timeline');
});
