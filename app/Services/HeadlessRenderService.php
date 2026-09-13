<?php

namespace App\Services;

use App\Models\Project;
use App\Services\HeadlessRender\DriverMessage;
use App\Services\HeadlessRender\RenderAccessToken;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Symfony\Component\Process\Exception\ProcessTimedOutException;
use Symfony\Component\Process\Process;

/**
 * Renders a project by running the REAL compositor in headless Chrome.
 *
 * The server render used to be a second renderer written in ffmpeg
 * filtergraphs, which structurally cannot express keyframes and so was always
 * behind the preview. This service replaces the compositor, not the server
 * render: it loads a bare page that calls `exportProjectVideo()` -- the same
 * `resolveFrame()` + `drawFrame()` + `planProjectAudio()` pipeline the preview
 * and the browser export use -- and collects the MP4 that comes out. Audio is
 * mixed and muxed entirely in the page, so no ffmpeg audio stage runs here.
 *
 * All the browser work happens in resources/js/headless/driver.mjs; this class
 * owns the token, the temp file and the progress plumbing.
 */
class HeadlessRenderService
{
    /**
     * Temp files this service created, so both the success and failure paths
     * can clean them. Named by uuid, never by a domain id: a render that
     * retried would otherwise collide with its own previous attempt.
     *
     * @var list<string>
     */
    protected array $tempPaths = [];

    /**
     * Render a project to an MP4 and return the temp path holding it.
     *
     * @param  callable(int $percent, string $phase): void|null  $onProgress
     * @return array{path: string, frame_count: int, duration_ms: int, has_audio: bool, warnings: list<string>}
     */
    public function render(Project $project, int $renderId, ?callable $onProgress = null): array
    {
        $token = RenderAccessToken::issue($project->id, $renderId);

        $outputPath = $this->tempPath('headless_'.Str::uuid().'.mp4');
        $specPath = $this->tempPath('headless_spec_'.Str::uuid().'.json');

        file_put_contents($specPath, json_encode($this->driverSpec($token, $outputPath), JSON_THROW_ON_ERROR));

        try {
            $summary = $this->runDriver($specPath, $onProgress);
        } finally {
            RenderAccessToken::revoke($token);
            @unlink($specPath);
        }

        if (! is_file($outputPath) || filesize($outputPath) === 0) {
            throw new \RuntimeException('The headless render finished without writing a video file.');
        }

        return [
            'path' => $outputPath,
            'frame_count' => (int) ($summary['frameCount'] ?? 0),
            'duration_ms' => (int) round((float) ($summary['durationMs'] ?? 0)),
            'has_audio' => (bool) ($summary['hasAudio'] ?? false),
            'warnings' => array_values(array_filter(
                (array) ($summary['warnings'] ?? []),
                'is_string',
            )),
        ];
    }

    /**
     * Every temp file this service created, for the caller's cleanup pass.
     *
     * @return list<string>
     */
    public function tempPaths(): array
    {
        return $this->tempPaths;
    }

    /**
     * @return array{url: string, outputPath: string, timeoutMs: int, chromeBinary: string|null, ignoreCertificateErrors: bool}
     */
    protected function driverSpec(string $token, string $outputPath): array
    {
        $base = rtrim((string) config('render.headless.base_url'), '/');
        $path = ltrim(parse_url(route('editor.headless.page', ['token' => $token]), PHP_URL_PATH) ?: '', '/');

        return [
            'url' => $base.'/'.$path,
            'outputPath' => $outputPath,
            'timeoutMs' => (int) config('render.headless.timeout', 870) * 1000,
            'chromeBinary' => config('render.headless.chrome_binary'),
            'ignoreCertificateErrors' => (bool) config('render.headless.ignore_certificate_errors'),
        ];
    }

    /**
     * Run the Node driver and translate its NDJSON stream into progress calls.
     *
     * @param  callable(int $percent, string $phase): void|null  $onProgress
     * @return array<string, mixed> the driver's `done` message
     */
    protected function runDriver(string $specPath, ?callable $onProgress): array
    {
        $timeout = (int) config('render.headless.timeout', 870);

        $process = new Process(
            [(string) config('render.headless.node_binary', 'node'), base_path('resources/js/headless/driver.mjs'), $specPath],
            base_path(),
            null,
            null,
            $timeout,
        );

        $done = null;
        $failure = null;
        $buffer = '';

        try {
            $process->run(function (string $type, string $chunk) use (&$buffer, &$done, &$failure, $onProgress): void {
                if ($type === Process::ERR) {
                    Log::debug('Headless render driver stderr', ['output' => $chunk]);

                    return;
                }

                $buffer .= $chunk;
                $drained = DriverMessage::drain($buffer);
                $buffer = $drained['remainder'];

                foreach ($drained['messages'] as $message) {
                    if ($message->type === 'progress' && $onProgress !== null) {
                        $onProgress($message->percent(), (string) ($message->data['phase'] ?? 'video'));
                    } elseif ($message->type === 'done') {
                        $done = $message->data;
                    } elseif ($message->type === 'error') {
                        $failure = $message->message();
                    } elseif ($message->type === 'log') {
                        Log::debug('Headless render page log', $message->data);
                    }
                }
            });
        } catch (ProcessTimedOutException $e) {
            throw new \RuntimeException('The headless render exceeded its time budget.', 0, $e);
        }

        if ($failure !== null) {
            throw new \RuntimeException('Headless render failed: '.$failure);
        }

        if ($done === null || ! $process->isSuccessful()) {
            throw new \RuntimeException('The headless render driver exited without producing a result.');
        }

        return $done;
    }

    protected function tempPath(string $filename): string
    {
        $directory = storage_path('app/temp');

        if (! is_dir($directory)) {
            mkdir($directory, 0775, true);
        }

        $path = $directory.'/'.$filename;
        $this->tempPaths[] = $path;

        return $path;
    }
}
