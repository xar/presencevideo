<?php

use App\Ai\Tools\ApplyVideoRecipe;
use App\Ai\Tools\LintVideoProject;
use App\Ai\Tools\ListVideoRecipes;
use App\Ai\Tools\PatchVideoProject;
use App\Models\BrandKit;
use App\Models\Project;
use App\Models\User;
use App\Services\ModelCliService;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Support\Str;
use Laravel\Ai\Tools\Request;
use Symfony\Component\Process\Process;

/**
 * These run the REAL model CLI bundle under Node so the PHP bridge and the
 * TypeScript model are exercised together; a missing bundle is built first.
 */
beforeEach(function () {
    $bundle = (string) config('render.model_cli.bundle_path');

    if (! is_file($bundle)) {
        $build = new Process(['npm', 'run', 'build:model-cli'], base_path(), timeout: 120);
        $build->run();

        expect($build->isSuccessful())->toBeTrue($build->getErrorOutput());
    }
});

function lintReportShape(array $report): void
{
    expect($report)->toHaveKeys(['profile', 'score', 'issues', 'summary'])
        ->and($report['score'])->toBeInt()->toBeGreaterThanOrEqual(0)->toBeLessThanOrEqual(100)
        ->and($report['summary'])->toHaveKeys(['errors', 'warnings', 'infos'])
        ->and($report['issues'])->toBeArray();

    foreach ($report['issues'] as $issue) {
        expect($issue)->toHaveKeys(['id', 'rule', 'severity', 'message'])
            ->and($issue['severity'])->toBeIn(['error', 'warning', 'info']);
    }
}

it('lists recipes with their brand slots through the model cli', function () {
    $recipes = (new ModelCliService)->listRecipes();

    expect($recipes)->not->toBeEmpty()
        ->and(collect($recipes)->pluck('id'))->toContain('tiktok-hook-body-cta')
        ->and($recipes[0])->toHaveKeys(['id', 'name', 'description', 'slots'])
        ->and($recipes[0]['slots'])->toHaveKeys(['colors', 'fonts', 'logo', 'outro', 'watermark', 'voice', 'music']);

    $payload = json_decode((string) (new ListVideoRecipes)->handle(new Request([])), true, flags: JSON_THROW_ON_ERROR);

    expect($payload['recipes'])->toHaveCount(count($recipes));
});

it('lints a stored project through the model cli and flags safe-zone and size problems', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create([
        'user_id' => $user->id,
        'scenes' => [[
            'id' => (string) Str::uuid(),
            'name' => 'Hook',
            'duration_ms' => 3000,
            'layers' => [[
                'id' => (string) Str::uuid(),
                'type' => 'text',
                'text' => 'Tiny corner text',
                'x' => 950, 'y' => 1750, 'width' => 120, 'height' => 60,
                'font_size' => 18,
                'font_color' => '#ffffff',
                'z_index' => 1,
            ]],
        ]],
    ]);

    $payload = json_decode((string) (new LintVideoProject($user))->handle(new Request([
        'project_id' => $project->id,
        'profile' => 'tiktok',
    ])), true, flags: JSON_THROW_ON_ERROR);

    lintReportShape($payload['lint']);

    $rules = collect($payload['lint']['issues'])->pluck('rule');

    expect($payload['project_id'])->toBe($project->id)
        ->and($payload['lint']['profile'])->toBe('tiktok')
        ->and($rules)->toContain('safe-zone')
        ->and($rules)->toContain('text-too-small')
        ->and($payload['lint']['score'])->toBeLessThan(100);
});

it('builds a project from a recipe with the brand kit, saves uuid ids and lints clean', function () {
    $user = User::factory()->create();
    $kit = BrandKit::factory()->create(['user_id' => $user->id]);

    $beats = [
        ['id' => 'b1', 'kind' => 'hook', 'headline' => 'Stop scrolling', 'voiceover' => 'Stop scrolling for a second.', 'duration_ms' => 2000],
        ['id' => 'b2', 'kind' => 'body', 'headline' => 'Three quick wins', 'duration_ms' => 3500, 'words' => [
            ['text' => 'Three', 'start_ms' => 0, 'end_ms' => 400],
            ['text' => 'quick', 'start_ms' => 400, 'end_ms' => 800],
            ['text' => 'wins', 'start_ms' => 800, 'end_ms' => 1200],
        ]],
        ['id' => 'b3', 'kind' => 'cta', 'headline' => 'Follow for more', 'duration_ms' => 2500],
    ];

    $payload = json_decode((string) (new ApplyVideoRecipe($user))->handle(new Request([
        'recipe' => 'tiktok-hook-body-cta',
        'name' => 'Recipe video',
        'brand_kit_id' => $kit->id,
        'beats_json' => json_encode($beats, JSON_THROW_ON_ERROR),
    ])), true, flags: JSON_THROW_ON_ERROR);

    $project = Project::findOrFail($payload['project_id']);

    expect($project->user_id)->toBe($user->id)
        ->and($project->brand_kit_id)->toBe($kit->id)
        ->and($project->resolution_width)->toBe(1080)
        ->and($project->scenes)->toHaveCount(3)
        ->and($payload['recipe'])->toBe('tiktok-hook-body-cta');

    lintReportShape($payload['lint']);
    expect($payload['lint']['summary']['errors'])->toBe(0)
        ->and(collect($payload['lint']['issues'])->pluck('rule'))->not->toContain('safe-zone');

    $sceneIds = collect($project->scenes)->pluck('id');

    foreach ($project->scenes as $scene) {
        expect(Str::isUuid($scene['id']))->toBeTrue();

        foreach ($scene['layers'] as $layer) {
            expect(Str::isUuid($layer['id']))->toBeTrue()
                ->and($sceneIds)->toContain($layer['track_id']);
        }
    }

    foreach ($project->subtitle_tracks as $track) {
        expect(Str::isUuid($track['id']))->toBeTrue();

        foreach ($track['entries'] as $entry) {
            expect(Str::isUuid($entry['id']))->toBeTrue();
        }
    }

    $headline = collect($project->scenes[0]['layers'])->first(fn (array $layer) => ($layer['type'] ?? null) === 'text');

    expect($headline)->not->toBeNull()
        ->and($headline['font_color'] ?? $headline['font_family'] ?? '')->toStartWith('brand.');
});

it('patches a project through operations and returns a fresh lint report', function () {
    $user = User::factory()->create();
    $layerId = (string) Str::uuid();
    $sceneId = (string) Str::uuid();
    $project = Project::factory()->create([
        'user_id' => $user->id,
        'scenes' => [[
            'id' => $sceneId,
            'name' => 'Hook',
            'duration_ms' => 3000,
            'layers' => [[
                'id' => $layerId,
                'type' => 'text',
                'text' => 'Headline',
                'x' => 100, 'y' => 1750, 'width' => 800, 'height' => 120,
                'font_size' => 20,
                'font_color' => '#ffffff',
                'z_index' => 1,
            ]],
        ]],
    ]);

    $before = json_decode((string) (new LintVideoProject($user))->handle(new Request(['project_id' => $project->id])), true, flags: JSON_THROW_ON_ERROR);

    $payload = json_decode((string) (new PatchVideoProject($user))->handle(new Request([
        'project_id' => $project->id,
        'operations_json' => json_encode([
            ['op' => 'update_element', 'element_id' => $layerId, 'fields' => ['y' => 400, 'font_size' => 72]],
            ['op' => 'set_scene', 'scene_id' => $sceneId, 'duration_ms' => 6000],
        ], JSON_THROW_ON_ERROR),
    ])), true, flags: JSON_THROW_ON_ERROR);

    $project->refresh();

    lintReportShape($payload['lint']);

    expect($payload['applied'])->toBe(['update_element', 'set_scene'])
        ->and($project->scenes[0]['layers'][0]['y'])->toBe(400)
        ->and($project->scenes[0]['layers'][0]['font_size'])->toBe(72)
        ->and($project->scenes[0]['duration_ms'])->toBe(6000)
        ->and($payload['lint']['score'])->toBeGreaterThan($before['lint']['score']);
});

it('reports patch errors without saving', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id, 'name' => 'Untouched']);

    $payload = json_decode((string) (new PatchVideoProject($user))->handle(new Request([
        'project_id' => $project->id,
        'operations_json' => json_encode([['op' => 'set_project', 'name' => 'Changed'], ['op' => 'explode']], JSON_THROW_ON_ERROR),
    ])), true, flags: JSON_THROW_ON_ERROR);

    expect($payload['error'])->toContain('Unknown op "explode"')
        ->and($payload['applied'])->toBe([])
        ->and($project->fresh()->name)->toBe('Untouched');
});

it('refuses to lint another user\'s project', function () {
    $owner = User::factory()->create();
    $other = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $owner->id]);

    (new LintVideoProject($other))->handle(new Request(['project_id' => $project->id]));
})->throws(ModelNotFoundException::class);

it('names the build command when the bundle is missing', function () {
    config(['render.model_cli.bundle_path' => '/nonexistent/model-cli.mjs']);

    (new ModelCliService)->listRecipes();
})->throws(RuntimeException::class, 'npm run build:model-cli');
