<?php

use App\Models\Project;
use App\Models\User;

it('persists every field of nested layers and clips, not only the validated ones', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $layer = [
        'id' => fake()->uuid(), 'type' => 'text', 'text' => 'Hi', 'x' => 12, 'y' => 34, 'width' => 300, 'height' => 80,
        'z_index' => 2, 'font_size' => 40, 'font_color' => '#ff00ff', 'font_family' => 'Impact', 'text_align' => 'left',
    ];
    $clip = [
        'id' => fake()->uuid(), 'type' => 'shape', 'shape' => 'ellipse', 'fill_color' => '#00ff00', 'start_ms' => 100,
        'duration_ms' => 2000, 'x' => 50, 'y' => 60, 'width' => 200, 'height' => 100, 'z_index' => 0, 'opacity' => 0.5,
    ];

    $this->actingAs($user)->put(route('editor.projects.update', $project), [
        'scenes' => [['id' => fake()->uuid(), 'name' => 'Intro', 'duration_ms' => 3000, 'background_color' => '#112233', 'layers' => [$layer]]],
        'video_tracks' => [['id' => fake()->uuid(), 'name' => 'Overlay', 'visible' => true, 'clips' => [$clip]]],
    ])->assertSessionHasNoErrors();

    $fresh = $project->refresh();

    expect($fresh->scenes[0])->toMatchArray(['name' => 'Intro', 'background_color' => '#112233'])
        ->and($fresh->scenes[0]['layers'][0])->toMatchArray($layer)
        ->and($fresh->video_tracks[0]['clips'][0])->toMatchArray($clip);
});
