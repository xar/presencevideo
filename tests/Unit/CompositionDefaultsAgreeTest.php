<?php

use App\Models\Project;
use App\Services\FFmpegService;
use App\Video\Composition\Data\LayerData;
use App\Video\Composition\Data\SceneData;

/**
 * The model is the single source of truth for element and scene defaults. The
 * composition builders and the render pipeline each carry their own fallbacks;
 * this pins them to the model's numbers so they cannot drift apart again.
 */
test('the scene duration default is the same everywhere', function () {
    expect(SceneData::fromArray(['id' => 'a'])->durationMs)->toBe(Project::DEFAULT_SCENE_DURATION_MS);

    $sceneDurationMs = (new ReflectionMethod(FFmpegService::class, 'sceneDurationMs'))
        ->invoke(app(FFmpegService::class), []);

    expect($sceneDurationMs)->toBe(Project::DEFAULT_SCENE_DURATION_MS);
});

test('the element geometry default is the same everywhere', function () {
    $project = new Project(['resolution_width' => 1080, 'resolution_height' => 1920]);

    $layer = LayerData::fromArray(['id' => 'a', 'type' => 'text'], $project);

    expect($layer->width)->toBe($project->defaultElementWidth())
        ->and($layer->height)->toBe($project->defaultElementHeight())
        ->and($layer->width)->toBe(270)
        ->and($layer->height)->toBe(480);

    $withoutProject = LayerData::fromArray(['id' => 'a', 'type' => 'text']);

    expect($withoutProject->width)->toBe((int) round(Project::DEFAULT_RESOLUTION_WIDTH / 4))
        ->and($withoutProject->height)->toBe((int) round(Project::DEFAULT_RESOLUTION_HEIGHT / 4));
});
