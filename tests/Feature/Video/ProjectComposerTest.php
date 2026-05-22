<?php

use App\Models\Asset;
use App\Models\Project;
use App\Models\User;
use App\Video\Composition\Data\StyleData;
use App\Video\Composition\ProjectComposer;
use App\Video\Composition\Timeline;

it('programmatically composes a complete project video document', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $image = Asset::factory()->create(['user_id' => $user->id, 'project_id' => $project->id, 'type' => 'image']);
    $video = Asset::factory()->create(['user_id' => $user->id, 'project_id' => $project->id, 'type' => 'video', 'duration_ms' => 6000]);
    $music = Asset::factory()->create(['user_id' => $user->id, 'project_id' => $project->id, 'type' => 'audio', 'duration_ms' => 9000]);

    $composer = ProjectComposer::for($project)
        ->resolution(1080, 1920)
        ->fps(30);

    $composer->scene('intro')
        ->duration(3000)
        ->background('#000000')
        ->image($image)
        ->cover()
        ->zIndex(0);

    $composer->scene('demo')
        ->duration(6000)
        ->video($video)
        ->fill()
        ->trim(0, 6000);

    $composer->videoTrack('Hook overlays')
        ->text('Hook text')
        ->safeArea()
        ->fontSize(72)
        ->stroke('#000000', 4);

    $composer->audioTrack('Music')
        ->volume(0.5)
        ->clip($music)
        ->start(0)
        ->duration(9000)
        ->volume(0.4)
        ->fadeIn(500)
        ->fadeOut(500);

    $composer->subtitles('Captions')
        ->style(StyleData::subtitle())
        ->entry(0, 1800, 'First line')
        ->entry(1800, 3600, 'Second line');

    $project = $composer->save();

    expect($project->resolution_width)->toBe(1080)
        ->and($project->resolution_height)->toBe(1920)
        ->and($project->fps)->toBe(30)
        ->and($project->scenes)->toHaveCount(2)
        ->and($project->scenes[0]['name'])->toBe('intro')
        ->and($project->scenes[0]['layers'][0]['asset_id'])->toBe($image->id)
        ->and($project->scenes[1]['layers'][0]['trim_end_ms'])->toBe(6000)
        ->and($project->video_tracks)->toHaveCount(1)
        ->and($project->video_tracks[0]['clips'][0]['text'])->toBe('Hook text')
        ->and($project->audio_tracks[0]['clips'][0]['fade_out_ms'])->toBe(500)
        ->and($project->subtitle_tracks[0]['entries'])->toHaveCount(2)
        ->and(Timeline::totalDuration($project))->toBe(9000);
});
