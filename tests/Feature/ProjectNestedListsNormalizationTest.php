<?php

use App\Models\Project;
use App\Models\User;

it('always exposes layers on scenes and clips on video tracks', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $project->forceFill([
        'scenes' => [['id' => fake()->uuid(), 'duration_ms' => 3000]],
        'video_tracks' => [['id' => fake()->uuid(), 'name' => 'Overlay']],
    ])->save();

    $fresh = Project::query()->findOrFail($project->id);

    expect($fresh->scenes[0]['layers'])->toBe([])
        ->and($fresh->video_tracks[0]['clips'])->toBe([]);
});

it('keeps existing layers and clips intact', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $layer = ['id' => fake()->uuid(), 'type' => 'text', 'text' => 'Hi', 'x' => 0, 'y' => 0, 'width' => 10, 'height' => 10, 'z_index' => 0, 'font_size' => 12, 'font_color' => '#fff'];
    $clip = ['id' => fake()->uuid(), 'type' => 'text', 'text' => 'Clip', 'start_ms' => 0, 'duration_ms' => 100, 'x' => 0, 'y' => 0, 'width' => 10, 'height' => 10, 'z_index' => 0];

    $project->forceFill([
        'scenes' => [['id' => fake()->uuid(), 'duration_ms' => 3000, 'layers' => [$layer]]],
        'video_tracks' => [['id' => fake()->uuid(), 'name' => 'Overlay', 'clips' => [$clip]]],
    ])->save();

    $fresh = Project::query()->findOrFail($project->id);

    expect($fresh->scenes[0]['layers'][0])->toMatchArray($layer)
        ->and($fresh->video_tracks[0]['clips'][0])->toMatchArray($clip);
});

it('fills element defaults on scene layers and overlay clips alike', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $project->forceFill([
        'scenes' => [['id' => fake()->uuid(), 'duration_ms' => 3000, 'layers' => [
            ['id' => fake()->uuid(), 'type' => 'text', 'x' => 0, 'y' => 0, 'width' => 10, 'height' => 10],
        ]]],
        'video_tracks' => [['id' => fake()->uuid(), 'name' => 'Overlay', 'clips' => [
            ['id' => fake()->uuid(), 'asset_id' => 3, 'start_ms' => 0, 'duration_ms' => 100],
            ['id' => fake()->uuid(), 'type' => 'shape', 'start_ms' => 0, 'duration_ms' => 100],
        ]]],
    ])->save();

    $fresh = Project::query()->findOrFail($project->id);

    expect($fresh->scenes[0]['layers'][0])->toMatchArray(['text' => '', 'font_size' => 48, 'font_color' => '#ffffff'])
        ->and($fresh->video_tracks[0]['clips'][0]['type'])->toBe('video')
        ->and($fresh->video_tracks[0]['clips'][1])->toMatchArray(['shape' => 'rectangle', 'fill_color' => '#ffffff']);
});
