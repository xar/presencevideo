<?php

use App\Enums\AssetSource;
use App\Enums\AssetType;
use App\Models\Asset;
use App\Models\Project;
use App\Services\FalAIService;
use App\Services\GenerationResult;

use function Pest\Laravel\mock;

it('composes the showcase project from generated fal assets without rendering', function () {
    mock(FalAIService::class)
        ->shouldReceive('generate')
        ->times(3)
        ->andReturnUsing(function ($generation) {
            $asset = Asset::create([
                'user_id' => $generation->user_id,
                'project_id' => $generation->project_id,
                'type' => AssetType::Image,
                'source' => AssetSource::Generated,
                'name' => 'Generated showcase image.png',
                'path' => 'assets/showcase.png',
                'disk' => 'local',
                'mime_type' => 'image/png',
                'size_bytes' => 1024,
                'width' => 1080,
                'height' => 1920,
                'metadata' => [],
            ]);

            return GenerationResult::success($asset->id, 'request-id');
        });

    $this->artisan('video:composition-showcase')
        ->expectsOutputToContain('Composed project document.')
        ->assertSuccessful();

    $project = Project::query()->where('name', 'Composition Primitives Showcase')->latest('id')->firstOrFail();

    expect($project->scenes)->toHaveCount(3)
        ->and($project->video_tracks)->toHaveCount(1)
        ->and($project->subtitle_tracks)->toHaveCount(1)
        ->and($project->subtitle_tracks[0]['entries'])->toHaveCount(3);
});
