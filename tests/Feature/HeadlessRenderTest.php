<?php

use App\Enums\RenderStatus;
use App\Jobs\RenderProject;
use App\Models\Asset;
use App\Models\Project;
use App\Models\Render;
use App\Services\FFmpegService;
use App\Services\HeadlessRender\DriverMessage;
use App\Services\HeadlessRender\HeadlessRenderPayload;
use App\Services\HeadlessRender\RenderAccessToken;
use App\Services\HeadlessRenderService;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * HeadlessRenderService stand-in: produces a real file without a browser, so
 * the job's driver switch, progress mapping and cleanup can be observed.
 */
class FakeHeadlessRenderService extends HeadlessRenderService
{
    public bool $shouldFail = false;

    public ?Project $renderedProject = null;

    public function render(Project $project, int $renderId, ?callable $onProgress = null): array
    {
        $this->renderedProject = $project;

        $path = $this->tempPath('headless_fake_'.Str::uuid().'.mp4');
        file_put_contents($path, 'fake-mp4');

        if ($onProgress !== null) {
            $onProgress(0, 'audio');
            $onProgress(50, 'video');
            $onProgress(100, 'finalizing');
        }

        if ($this->shouldFail) {
            throw new RuntimeException('Headless render failed: the page crashed at /var/www/html/resources');
        }

        return [
            'path' => $path,
            'frame_count' => 60,
            'duration_ms' => 2000,
            'has_audio' => true,
            'warnings' => [],
        ];
    }
}

function headlessRender(): Render
{
    $project = Project::factory()->create([
        'scenes' => [['id' => 'scene-1', 'duration_ms' => 2000, 'layers' => []]],
        'audio_tracks' => [],
        'video_tracks' => [],
        'subtitle_tracks' => [],
    ]);

    return Render::factory()->forProject($project)->create();
}

/* ---------------------------------------------------------------- */
/* the driver switch */
/* ---------------------------------------------------------------- */

it('uses the legacy ffmpeg compositor unless the headless driver is configured', function () {
    expect(config('render.driver'))->toBe('ffmpeg');
});

it('renders through headless chrome and never touches ffmpeg when the driver is headless', function () {
    Storage::fake('local');
    config(['render.driver' => 'headless']);

    $headless = new FakeHeadlessRenderService;
    $render = headlessRender();

    // A bare FFmpegService would throw the moment any of its methods ran.
    (new RenderProject($render))->handle(new FFmpegService, $headless);

    $render->refresh();

    expect($headless->renderedProject?->id)->toBe($render->project_id)
        ->and($render->status)->toBe(RenderStatus::Completed)
        ->and($render->progress)->toBe(100)
        ->and($render->output_path)->not->toBeNull();

    Storage::assertExists($render->output_path);
});

it('reports headless progress inside the band the polling UI expects', function () {
    Storage::fake('local');
    config(['render.driver' => 'headless']);

    $seen = [];
    $render = headlessRender();
    Render::saved(function (Render $saved) use (&$seen): void {
        $seen[] = [$saved->status, $saved->progress];
    });

    (new RenderProject($render))->handle(new FFmpegService, new FakeHeadlessRenderService);

    $percents = array_column($seen, 1);

    // Progress is monotonic and never regresses below the 10 the job sets when
    // compositing starts, nor reaches 100 before the file is actually stored.
    expect($percents)->toContain(10)
        ->and(max($percents))->toBe(100)
        ->and(array_values(array_unique($percents)))->toBe([0, 10, 53, 95, 100]);
});

it('cleans up the headless intermediate on both the success and failure paths', function () {
    Storage::fake('local');
    config(['render.driver' => 'headless']);

    $headless = new FakeHeadlessRenderService;
    (new RenderProject(headlessRender()))->handle(new FFmpegService, $headless);

    foreach ($headless->tempPaths() as $path) {
        expect(file_exists($path))->toBeFalse("leaked temp file: {$path}");
    }

    $failing = new FakeHeadlessRenderService;
    $failing->shouldFail = true;

    expect(fn () => (new RenderProject(headlessRender()))->handle(new FFmpegService, $failing))
        ->toThrow(RuntimeException::class);

    expect($failing->tempPaths())->not->toBeEmpty();

    foreach ($failing->tempPaths() as $path) {
        expect(file_exists($path))->toBeFalse("leaked temp file: {$path}");
    }
});

it('keeps the browser budget below the job timeout so cleanup can still run', function () {
    // If the browser were allowed to outlive the job, the worker would SIGKILL
    // the job and its `finally` would never delete the partial mp4.
    expect(config('render.headless.timeout'))
        ->toBeLessThan((new RenderProject(new Render))->timeout);
});

it('does not leak page internals into the user-facing failure message', function () {
    Storage::fake('local');
    config(['render.driver' => 'headless']);

    $failing = new FakeHeadlessRenderService;
    $failing->shouldFail = true;
    $render = headlessRender();

    expect(fn () => (new RenderProject($render))->handle(new FFmpegService, $failing))
        ->toThrow(RuntimeException::class);

    expect($render->refresh()->error_message)
        ->not->toContain('/var/www')
        ->toContain('render #'.$render->id);
});

/* ---------------------------------------------------------------- */
/* the payload */
/* ---------------------------------------------------------------- */

it('rewrites asset urls onto the token-scoped route so a session-free chrome can decode them', function () {
    $project = Project::factory()->create();
    $asset = Asset::factory()->create([
        'project_id' => $project->id,
        'user_id' => $project->user_id,
        'thumbnail_path' => 'thumbs/a.jpg',
    ]);

    $payload = HeadlessRenderPayload::forProject($project->fresh(), 'test-token');

    expect($payload['project']['assets'][0]['url'])
        ->toContain("/editor/headless/test-token/assets/{$asset->id}")
        ->and($payload['project']['assets'][0]['url'])->not->toContain('/editor/assets/')
        ->and($payload['project']['assets'][0]['thumbnail_url'])->toContain('/thumbnail');
});

/* ---------------------------------------------------------------- */
/* the token-scoped surface */
/* ---------------------------------------------------------------- */

it('serves the render page only for a live token', function () {
    $project = Project::factory()->create([
        'scenes' => [['id' => 's1', 'duration_ms' => 1000, 'layers' => []]],
    ]);
    $token = RenderAccessToken::issue($project->id, 1);

    $this->get(route('editor.headless.page', ['token' => $token]))
        ->assertOk()
        ->assertSee('headless-render-payload', false);

    RenderAccessToken::revoke($token);

    $this->get(route('editor.headless.page', ['token' => $token]))->assertNotFound();
    $this->get(route('editor.headless.page', ['token' => 'never-issued']))->assertNotFound();
});

it('refuses to serve an asset belonging to another project', function () {
    Storage::fake('local');

    $mine = Project::factory()->create();
    $theirs = Project::factory()->create();

    $foreign = Asset::factory()->create([
        'project_id' => $theirs->id,
        'user_id' => $theirs->user_id,
    ]);

    $token = RenderAccessToken::issue($mine->id, 1);

    $this->get(route('editor.headless.asset', ['token' => $token, 'asset' => $foreign]))
        ->assertForbidden();
});

/* ---------------------------------------------------------------- */
/* the line protocol */
/* ---------------------------------------------------------------- */

it('reassembles driver messages split across process output chunks', function () {
    // Symfony hands stdout in arbitrary chunks; a `done` message split down the
    // middle used to be dropped, turning a finished render into a failure.
    $first = DriverMessage::drain('{"type":"progress","percent":12}'."\n".'{"type":"do');
    $second = DriverMessage::drain($first['remainder'].'ne","frameCount":60}'."\n");

    expect($first['messages'])->toHaveCount(1)
        ->and($first['messages'][0]->percent())->toBe(12)
        ->and($second['messages'])->toHaveCount(1)
        ->and($second['messages'][0]->type)->toBe('done')
        ->and($second['messages'][0]->data['frameCount'])->toBe(60);
});

it('ignores unstructured noise on the driver stdout', function () {
    $drained = DriverMessage::drain("Chrome wrote something\n{\"type\":\"nope\"}\nnot json\n{\n");

    expect($drained['messages'])->toBeEmpty()
        ->and($drained['remainder'])->toBe('');
});

it('clamps driver progress into 0-100', function () {
    expect(DriverMessage::parse('{"type":"progress","percent":-5}')?->percent())->toBe(0)
        ->and(DriverMessage::parse('{"type":"progress","percent":140}')?->percent())->toBe(100)
        ->and(DriverMessage::parse('{"type":"progress","percent":33.6}')?->percent())->toBe(34);
});
