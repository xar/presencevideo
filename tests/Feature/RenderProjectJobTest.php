<?php

use App\Enums\RenderStatus;
use App\Jobs\RenderProject;
use App\Models\Project;
use App\Models\Render;
use App\Services\FFmpegService;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * FFmpegService stand-in that creates real (tiny) temp files so the job's
 * cleanup behaviour can be observed without running ffmpeg.
 */
class RecordingFFmpegService extends FFmpegService
{
    /** @var array<int, string> */
    public array $created = [];

    public bool $failAfterScenes = false;

    public function renderScene(Project $project, array $scene): string
    {
        return $this->makeTemp('scene_');
    }

    public function concatenateVideos(array $videoPaths, array $scenes = [], int $fps = 30): string
    {
        if ($this->failAfterScenes) {
            throw new RuntimeException(
                'Video concatenation failed: ffmpeg error reading /var/www/html/storage/app/temp/scene_abc.mp4'
            );
        }

        return $this->makeTemp('concat_');
    }

    public function extractSceneAudio(array $scenes, int $fps = 30): ?string
    {
        return $this->makeTemp('scene_audio_', '.wav');
    }

    public function mergeAudioVideo(string $videoPath, string $audioPath): string
    {
        @unlink($videoPath);
        @unlink($audioPath);

        return $this->makeTemp('final_');
    }

    protected function makeTemp(string $prefix, string $extension = '.mp4'): string
    {
        $path = $this->getTempPath($prefix.Str::uuid().$extension);
        file_put_contents($path, 'fake-media');
        $this->created[] = $path;

        return $path;
    }
}

function renderForScenes(): Render
{
    $project = Project::factory()->create([
        'scenes' => [
            ['id' => 'scene-1', 'duration_ms' => 1000, 'layers' => []],
            ['id' => 'scene-2', 'duration_ms' => 1000, 'layers' => []],
        ],
        'audio_tracks' => [],
        'video_tracks' => [],
        'subtitle_tracks' => [],
    ]);

    return Render::factory()->forProject($project)->create();
}

it('dispatches renders onto the dedicated renders queue', function () {
    Queue::fake();

    RenderProject::dispatch(Render::factory()->create());

    Queue::assertPushedOn('renders', RenderProject::class);
});

it('keeps the broker visibility timeout above the worker and job timeouts', function () {
    $jobTimeout = (new RenderProject(new Render))->timeout;

    // Laravel requires retry_after > timeout; otherwise the broker hands a
    // still-running render to a second worker.
    foreach (['redis', 'database', 'beanstalkd'] as $connection) {
        expect(config("queue.connections.{$connection}.retry_after"))
            ->toBeGreaterThan($jobTimeout, "{$connection} retry_after must exceed the job timeout");
    }

    // The worker's --timeout must not be lower than the job's, or renders are
    // SIGKILLed before their own budget is spent.
    $env = file_get_contents(base_path('.env.docker.example'));
    preg_match('/^QUEUE_TIMEOUT=(\d+)$/m', $env, $workerTimeout);
    preg_match('/^QUEUE_RETRY_AFTER=(\d+)$/m', $env, $retryAfter);

    expect((int) $workerTimeout[1])->toBe($jobTimeout)
        ->and((int) $retryAfter[1])->toBeGreaterThan((int) $workerTimeout[1]);
});

it('streams the finished render into storage instead of buffering it in memory', function () {
    Storage::fake('local');

    $ffmpeg = new RecordingFFmpegService;
    $render = renderForScenes();

    (new RenderProject($render))->handle($ffmpeg);

    $render->refresh();

    expect($render->status)->toBe(RenderStatus::Completed)
        ->and($render->output_path)->not->toBeNull();

    Storage::assertExists($render->output_path);

    // file_get_contents() on a multi-GB render OOMs the worker; the job must not
    // read the file into a PHP string.
    $source = file_get_contents(app_path('Jobs/RenderProject.php'));
    expect($source)->toContain('Storage::writeStream')
        ->and($source)->not->toContain('file_get_contents($finalOutput)');
});

it('removes every intermediate file on the success path', function () {
    Storage::fake('local');

    $ffmpeg = new RecordingFFmpegService;

    (new RenderProject(renderForScenes()))->handle($ffmpeg);

    expect($ffmpeg->created)->not->toBeEmpty();

    foreach ($ffmpeg->created as $path) {
        expect(file_exists($path))->toBeFalse("leaked temp file: {$path}");
    }
});

it('removes every intermediate file when the render fails', function () {
    Storage::fake('local');

    $ffmpeg = new RecordingFFmpegService;
    $ffmpeg->failAfterScenes = true;
    $render = renderForScenes();

    expect(fn () => (new RenderProject($render))->handle($ffmpeg))
        ->toThrow(RuntimeException::class);

    expect($ffmpeg->created)->not->toBeEmpty();

    foreach ($ffmpeg->created as $path) {
        expect(file_exists($path))->toBeFalse("leaked temp file: {$path}");
    }
});

it('never stores raw ffmpeg stderr on the render record', function () {
    Storage::fake('local');

    $ffmpeg = new RecordingFFmpegService;
    $ffmpeg->failAfterScenes = true;
    $render = renderForScenes();

    expect(fn () => (new RenderProject($render))->handle($ffmpeg))
        ->toThrow(RuntimeException::class);

    $render->refresh();

    expect($render->status)->toBe(RenderStatus::Failed)
        ->and($render->error_message)->not->toContain('/var/www')
        ->and($render->error_message)->not->toContain('ffmpeg')
        ->and($render->error_message)->toContain('render #'.$render->id);
});

it('keeps user-actionable failures readable', function () {
    Storage::fake('local');

    $project = Project::factory()->create(['scenes' => []]);
    $render = Render::factory()->forProject($project)->create();

    expect(fn () => (new RenderProject($render))->handle(new RecordingFFmpegService))
        ->toThrow(RuntimeException::class);

    expect($render->refresh()->error_message)->toBe('No scenes to render');
});
