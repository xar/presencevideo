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

it('derives absolute element timing from scene prefix sums', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $project->forceFill([
        'scenes' => [
            ['id' => fake()->uuid(), 'duration_ms' => 3000, 'layers' => [['id' => fake()->uuid(), 'type' => 'text']]],
            ['id' => fake()->uuid(), 'duration_ms' => 2500, 'layers' => [['id' => fake()->uuid(), 'type' => 'text']]],
            ['id' => fake()->uuid(), 'duration_ms' => 1000, 'layers' => [['id' => fake()->uuid(), 'type' => 'text']]],
        ],
    ])->save();

    $scenes = Project::query()->findOrFail($project->id)->scenes;

    expect($scenes[0]['layers'][0])->toMatchArray(['start_ms' => 0, 'end_ms' => 3000])
        ->and($scenes[1]['layers'][0])->toMatchArray(['start_ms' => 3000, 'end_ms' => 5500])
        ->and($scenes[2]['layers'][0])->toMatchArray(['start_ms' => 5500, 'end_ms' => 6500]);
});

it('falls back to the shared scene duration default when a legacy scene carries none', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $project->forceFill([
        'scenes' => [
            ['id' => fake()->uuid(), 'layers' => [['id' => fake()->uuid(), 'type' => 'text']]],
            ['id' => fake()->uuid(), 'duration_ms' => 1000, 'layers' => [['id' => fake()->uuid(), 'type' => 'text']]],
        ],
    ])->save();

    $scenes = Project::query()->findOrFail($project->id)->scenes;

    expect($scenes[0]['layers'][0]['end_ms'])->toBe(Project::DEFAULT_SCENE_DURATION_MS)
        ->and($scenes[1]['layers'][0]['start_ms'])->toBe(Project::DEFAULT_SCENE_DURATION_MS);
});

it('gives a scene layer the enclosing scene id as its track id', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);
    $sceneId = fake()->uuid();
    $trackId = fake()->uuid();

    $project->forceFill([
        'scenes' => [['id' => $sceneId, 'duration_ms' => 1000, 'layers' => [['id' => fake()->uuid(), 'type' => 'text']]]],
        'video_tracks' => [['id' => $trackId, 'name' => 'Overlay', 'clips' => [['id' => fake()->uuid(), 'type' => 'text', 'start_ms' => 0, 'duration_ms' => 500]]]],
    ])->save();

    $fresh = Project::query()->findOrFail($project->id);

    expect($fresh->scenes[0]['layers'][0]['track_id'])->toBe($sceneId)
        ->and($fresh->video_tracks[0]['clips'][0]['track_id'])->toBe($trackId);
});

it('derives a video track clip end from its start and duration', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $project->forceFill([
        'video_tracks' => [['id' => fake()->uuid(), 'name' => 'Overlay', 'clips' => [
            ['id' => fake()->uuid(), 'type' => 'text', 'start_ms' => 1200, 'duration_ms' => 800],
            ['id' => fake()->uuid(), 'type' => 'text'],
        ]]],
    ])->save();

    $clips = Project::query()->findOrFail($project->id)->video_tracks[0]['clips'];

    expect($clips[0])->toMatchArray(['start_ms' => 1200, 'end_ms' => 2000])
        ->and($clips[1])->toMatchArray(['start_ms' => 0, 'end_ms' => Project::DEFAULT_ELEMENT_DURATION_MS]);
});

it('leaves elements that already carry timing untouched and normalizes idempotently', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);
    $trackId = fake()->uuid();

    $project->forceFill([
        'scenes' => [['id' => fake()->uuid(), 'duration_ms' => 3000, 'layers' => [
            ['id' => fake()->uuid(), 'type' => 'text', 'start_ms' => 250, 'end_ms' => 900, 'track_id' => $trackId],
        ]]],
    ])->save();

    $once = Project::query()->findOrFail($project->id)->scenes;

    expect($once[0]['layers'][0])->toMatchArray(['start_ms' => 250, 'end_ms' => 900, 'track_id' => $trackId]);

    $project->forceFill(['scenes' => $once])->save();

    expect(Project::query()->findOrFail($project->id)->scenes)->toBe($once);
});

it('passes unknown element types and non canonical enum values through unchanged', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $effect = ['id' => fake()->uuid(), 'type' => 'effect', 'effect' => 'vignette', 'intensity' => 0.34, 'z_index' => 91];
    $shape = ['id' => fake()->uuid(), 'type' => 'shape', 'shape' => 'rect', 'align' => 'center', 'font_weight' => '600'];

    $project->forceFill([
        'scenes' => [['id' => fake()->uuid(), 'duration_ms' => 2000, 'start_ms' => 0, 'layers' => [$effect, $shape]]],
    ])->save();

    $layers = Project::query()->findOrFail($project->id)->scenes[0]['layers'];

    expect($layers[0])->toMatchArray($effect)
        ->and($layers[0])->not->toHaveKey('fit')
        ->and($layers[1])->toMatchArray($shape)
        ->and($layers[1]['shape'])->toBe('rect');
});

it('defaults fit to cover for media elements only', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $project->forceFill([
        'scenes' => [['id' => fake()->uuid(), 'duration_ms' => 2000, 'layers' => [
            ['id' => fake()->uuid(), 'type' => 'video', 'asset_id' => 1],
            ['id' => fake()->uuid(), 'type' => 'image', 'asset_id' => 2, 'fit' => 'contain'],
            ['id' => fake()->uuid(), 'type' => 'text'],
        ]]],
    ])->save();

    $layers = Project::query()->findOrFail($project->id)->scenes[0]['layers'];

    expect($layers[0]['fit'])->toBe('cover')
        ->and($layers[1]['fit'])->toBe('contain')
        ->and($layers[2])->not->toHaveKey('fit');
});

it('normalizes subtitle tracks instead of bypassing normalization', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $project->forceFill([
        'subtitle_tracks' => [
            ['id' => fake()->uuid(), 'name' => 'Captions'],
            'not-a-track',
            ['id' => fake()->uuid(), 'name' => 'Other', 'entries' => [3 => ['id' => fake()->uuid(), 'start_ms' => 0, 'end_ms' => 10, 'text' => 'hi'], 'junk']],
        ],
    ])->save();

    $tracks = Project::query()->findOrFail($project->id)->subtitle_tracks;

    expect($tracks)->toHaveCount(2)
        ->and($tracks[0]['entries'])->toBe([])
        ->and($tracks[1]['entries'])->toHaveCount(1)
        ->and($tracks[1]['entries'][0]['text'])->toBe('hi');
});

it('round trips keyframes through persistence', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $keyframes = [
        'x' => [['time_ms' => 0, 'value' => 0, 'easing' => 'ease-out'], ['time_ms' => 1000, 'value' => 240]],
        'adjustments.brightness' => [['time_ms' => 0, 'value' => -0.2, 'easing' => [0.4, 0, 0.2, 1]]],
    ];

    $project->forceFill([
        'scenes' => [['id' => fake()->uuid(), 'duration_ms' => 2000, 'layers' => [
            ['id' => fake()->uuid(), 'type' => 'text', 'keyframes' => $keyframes],
        ]]],
    ])->save();

    expect(Project::query()->findOrFail($project->id)->scenes[0]['layers'][0]['keyframes'])->toBe($keyframes);
});
