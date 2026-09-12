<?php

use App\Models\Project;
use App\Services\FFmpegService;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Process;
use Tests\TestCase;

uses(TestCase::class);

/**
 * Covers the FFmpegService methods that actually shell out. The process layer is
 * faked, so these assert the command line and the control flow around it.
 */
class StubbedGraphFFmpegService extends FFmpegService
{
    public bool $hasSceneAudio = true;

    /**
     * @return array{filters: array<int, string>, inputs: array<int, string>, output: string|null}
     */
    public function buildSceneAudioFilter(array $scenes, int $fps = 30, ?callable $resolveAsset = null): array
    {
        if (! $this->hasSceneAudio) {
            return ['filters' => [], 'inputs' => [], 'output' => null];
        }

        return [
            'filters' => ['[0:a]anull[aout]'],
            'inputs' => ['/media/scene.mp4'],
            'output' => '[aout]',
        ];
    }

    /**
     * @return array{filters: array<int, string>, inputs: array<int, string>, output: string|null}
     */
    public function buildAudioMixFilter(
        array $audioTracks,
        ?callable $resolveAsset = null,
        array $scenes = [],
        int $fps = 30,
    ): array {
        return [
            'filters' => ['[0:a]anull[a0]', '[a0]amix=inputs=1:duration=longest:normalize=0,alimiter=limit=0.95:level=disabled[aout]'],
            'inputs' => ['/media/music.mp3'],
            'output' => '[aout]',
        ];
    }
}

/**
 * @return array<int, array<int, string>>
 */
function ranCommands(): array
{
    $commands = [];

    Process::assertRan(function ($process) use (&$commands) {
        $commands[] = $process->command;

        return true;
    });

    return $commands;
}

it('names scene temp files by uuid so concurrent renders cannot collide', function () {
    Process::fake();

    $service = new FFmpegService;
    $project = new Project([
        'resolution_width' => 1920,
        'resolution_height' => 1080,
        'fps' => 30,
    ]);

    $scene = ['id' => 'scene-one', 'duration_ms' => 1000, 'layers' => []];

    $first = $service->renderScene($project, $scene);
    $second = $service->renderScene($project, $scene);

    expect($first)->not->toBe($second)
        ->and(basename($first))->not->toContain('scene-one')
        ->and(basename($first))->toStartWith('scene_')
        ->and(basename($first))->toEndWith('.mp4');

    @unlink($first);
    @unlink($second);
});

it('copies the video stream when muxing audio instead of re-encoding it', function () {
    $command = (new FFmpegService)->buildMergeAudioVideoCommand('/tmp/v.mp4', '/tmp/a.wav', '/tmp/out.mp4');

    $index = array_search('-c:v', $command, true);

    expect($index)->not->toBeFalse()
        ->and($command[$index + 1])->toBe('copy')
        ->and($command)->not->toContain('libx264')
        ->and($command)->toContain('-c:a')
        ->and($command)->toContain('aac')
        ->and($command)->toContain('-movflags')
        ->and($command)->toContain('+faststart')
        ->and($command)->toContain('-brand')
        ->and($command)->toContain('mp42');
});

it('pads the audio so a slightly shorter mix cannot clip the video tail', function () {
    $command = (new FFmpegService)->buildMergeAudioVideoCommand('/tmp/v.mp4', '/tmp/a.wav', '/tmp/out.mp4');

    $index = array_search('-filter_complex', $command, true);

    // apad makes the audio effectively infinite; -shortest then truncates it back
    // to the (authoritative) video duration rather than truncating the video.
    expect($index)->not->toBeFalse()
        ->and($command[$index + 1])->toBe('[1:a]apad[aout]')
        ->and($command)->toContain('-shortest')
        ->and($command)->toContain('0:v:0')
        ->and($command)->toContain('[aout]');
});

it('writes lossless wav intermediates for the audio track mix', function () {
    Process::fake();

    $output = (new StubbedGraphFFmpegService)->mixAudioTracks([['clips' => [['asset_id' => 1]]]], 5000);

    expect($output)->toEndWith('.wav');

    $command = ranCommands()[0];

    expect($command)->toContain('-c:a')
        ->and($command)->toContain(FFmpegService::AUDIO_INTERMEDIATE_CODEC);

    @unlink($output);
});

it('writes lossless wav intermediates for extracted scene audio', function () {
    Process::fake();

    $output = (new StubbedGraphFFmpegService)->extractSceneAudio([['duration_ms' => 1000]]);

    expect($output)->not->toBeNull()
        ->and($output)->toEndWith('.wav')
        ->and(ranCommands()[0])->toContain(FFmpegService::AUDIO_INTERMEDIATE_CODEC);

    @unlink($output);
});

it('sums two audio files without halving them and keeps the mix lossless', function () {
    Process::fake();

    $service = new FFmpegService;
    $audioA = tempnam(sys_get_temp_dir(), 'a');
    $audioB = tempnam(sys_get_temp_dir(), 'b');

    $output = $service->mixTwoAudioFiles($audioA, $audioB, 5000);

    expect($output)->toEndWith('.wav');

    $command = ranCommands()[0];
    $index = array_search('-filter_complex', $command, true);

    expect($command[$index + 1])
        ->toBe('[0:a][1:a]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.95:level=disabled[aout]')
        ->and($command)->toContain(FFmpegService::AUDIO_INTERMEDIATE_CODEC);

    @unlink($output);
});

it('keeps every audio intermediate lossless', function () {
    // Regression guard: an mp3 intermediate re-introduces both a lossy generation
    // and ~26ms of encoder/decoder delay padding, which breaks adelay positioning.
    $source = file_get_contents(app_path('Services/FFmpegService.php'));

    expect(FFmpegService::AUDIO_INTERMEDIATE_EXTENSION)->toBe('.wav')
        ->and($source)->not->toContain(".mp3'");
});

it('returns null when the scene videos simply carry no audio stream', function () {
    Process::fake(['*' => Process::result('', "Stream specifier ':a' in filtergraph matches no streams.", 1)]);

    $output = (new StubbedGraphFFmpegService)->extractSceneAudio([['duration_ms' => 1000]]);

    expect($output)->toBeNull();
});

it('fails loudly when scene audio extraction genuinely errors', function () {
    Log::spy();
    Process::fake(['*' => Process::result('', 'Error initializing complex filters: Invalid argument', 1)]);

    expect(fn () => (new StubbedGraphFFmpegService)->extractSceneAudio([['duration_ms' => 1000]]))
        ->toThrow(RuntimeException::class, 'Scene audio extraction failed');

    Log::shouldHaveReceived('error')->once();
});

it('returns null without running ffmpeg when no scene has audio', function () {
    Process::fake();

    $service = new StubbedGraphFFmpegService;
    $service->hasSceneAudio = false;

    expect($service->extractSceneAudio([['duration_ms' => 1000]]))->toBeNull();

    Process::assertNothingRan();
});
