<?php

use App\Models\Project;
use App\Models\User;

it('normalizes missing audio track volumes for existing projects', function () {
    $project = Project::factory()->create([
        'audio_tracks' => [
            [
                'id' => 'b2480b61-9641-4f42-8f0f-9942e6b93dcb',
                'name' => 'VO',
                'clips' => [
                    [
                        'id' => 'fb4cfc43-b856-402f-a61a-d248ba9253bf',
                        'asset_id' => 63,
                        'start_ms' => 0,
                        'duration_ms' => 20000,
                    ],
                ],
            ],
        ],
    ]);

    expect($project->fresh()->audio_tracks[0]['volume'])->toBe(1.0)
        ->and($project->fresh()->audio_tracks[0]['muted'])->toBeFalse()
        ->and($project->fresh()->audio_tracks[0]['clips'][0]['volume'])->toBe(1.0);
});

it('sends normalized audio tracks to the editor', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create([
        'user_id' => $user->id,
        'audio_tracks' => [
            [
                'id' => 'ad832b8d-0e47-4bbb-9298-fdfcc0fb5744',
                'name' => 'Music bed',
                'clips' => [
                    [
                        'id' => '14f5ce39-557a-42cd-bc2e-73fc51f13230',
                        'asset_id' => 55,
                        'start_ms' => 0,
                        'duration_ms' => 20000,
                    ],
                ],
            ],
        ],
    ]);

    $response = $this->actingAs($user)->get(route('editor.projects.show', $project));

    $response->assertOk();
    $response->assertInertia(fn ($page) => $page
        ->where('project.audio_tracks.0.volume', 1)
        ->where('project.audio_tracks.0.muted', false)
        ->where('project.audio_tracks.0.clips.0.volume', 1)
    );
});
