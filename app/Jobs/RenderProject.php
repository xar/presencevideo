<?php

namespace App\Jobs;

use App\Enums\RenderStatus;
use App\Events\AgentActivityUpdated;
use App\Models\AgentActivity;
use App\Models\Asset;
use App\Models\Project;
use App\Models\Render;
use App\Services\FFmpegService;
use App\Services\HeadlessRenderService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class RenderProject implements ShouldQueue
{
    use Queueable;

    /**
     * Failure messages we raise ourselves and that are safe to show the user.
     *
     * Anything not matching these is assumed to contain ffmpeg stderr (server
     * paths, filtergraphs) and is replaced with a generic summary.
     *
     * @var list<string>
     */
    protected const SAFE_ERROR_PREFIXES = [
        'No scenes to render',
        'Asset files not found on disk',
    ];

    public int $tries = 1;

    /**
     * Wall-clock budget for a render, in seconds.
     *
     * This value is only an upper bound *inside* the worker: the worker process
     * itself is started with `--timeout` (docker/entrypoint.sh, QUEUE_TIMEOUT)
     * and the smaller of the two wins, so a job-level timeout larger than the
     * worker's is silently ignored and the job is SIGKILLed at the worker's
     * limit instead. Keep this in lockstep with QUEUE_TIMEOUT.
     *
     * The queue connection's `retry_after` must in turn be strictly greater
     * than this value (see config/queue.php); otherwise the broker hands the
     * same render to a second worker while the first is still encoding.
     */
    public int $timeout = 900;

    /**
     * Create a new job instance.
     */
    public function __construct(public Render $render)
    {
        // Renders are long-running and must not block the shared default queue.
        $this->onQueue('renders');
    }

    /**
     * Execute the job.
     */
    public function handle(FFmpegService $ffmpeg, HeadlessRenderService $headless): void
    {
        $this->render->update([
            'status' => RenderStatus::Processing,
            'started_at' => now(),
        ]);

        /** @var array<int, string> $tempPaths every intermediate this job creates */
        $tempPaths = [];

        try {
            $project = $this->render->project;
            $scenes = $project->scenes ?? [];

            if (empty($scenes)) {
                throw new \RuntimeException('No scenes to render');
            }

            // Validate all asset files exist before starting render
            $this->validateAssetFiles($project);

            $this->render->update([
                'status' => RenderStatus::Compositing,
                'progress' => 10,
            ]);

            if ($this->usesHeadlessDriver()) {
                $this->publish($this->renderWithHeadlessChrome($headless, $project));

                return;
            }

            $sceneVideos = [];
            $totalScenes = count($scenes);

            foreach ($scenes as $index => $scene) {
                $sceneVideo = $ffmpeg->renderScene($project, $scene);
                $sceneVideos[] = $sceneVideo;
                $tempPaths[] = $sceneVideo;

                $progress = 10 + (int) (($index + 1) / $totalScenes * 50);
                $this->render->update(['progress' => $progress]);
            }

            $this->render->update([
                'status' => RenderStatus::Mixing,
                'progress' => 70,
            ]);

            // Scene transitions (when any) are applied while joining the scenes,
            // which overlaps neighbouring scenes and shortens the output.
            $concatenated = $ffmpeg->concatenateVideos($sceneVideos, $scenes, $project->fps);
            $tempPaths[] = $concatenated;

            // Apply video track overlays (PIP, watermarks, etc.)
            $videoTracks = $project->video_tracks ?? [];
            if (! empty($videoTracks)) {
                $this->render->update(['progress' => 75]);
                $concatenated = $ffmpeg->overlayVideoTracks($concatenated, $videoTracks, $project);
                $tempPaths[] = $concatenated;
            }

            // Burn subtitles onto the video
            $subtitleTracks = $project->subtitle_tracks ?? [];
            if (! empty($subtitleTracks)) {
                $this->render->update(['progress' => 78]);
                $concatenated = $ffmpeg->burnSubtitles($concatenated, $subtitleTracks, $project);
                $tempPaths[] = $concatenated;
            }

            $audioTracks = $project->audio_tracks ?? [];
            $totalDurationMs = $ffmpeg->totalOutputDurationMs($scenes, $project->fps);

            // Extract audio from video layers in scenes
            $sceneAudio = $ffmpeg->extractSceneAudio($scenes, $project->fps);

            if ($sceneAudio !== null) {
                $tempPaths[] = $sceneAudio;
            }

            $finalOutput = $concatenated;

            // If we have both scene audio and audio tracks, mix them together
            if ($sceneAudio && ! empty($audioTracks)) {
                $mixedTracks = $ffmpeg->mixAudioTracks($audioTracks, $totalDurationMs, $scenes, $project->fps);
                $tempPaths[] = $mixedTracks;
                $mixedAudio = $ffmpeg->mixTwoAudioFiles($sceneAudio, $mixedTracks, $totalDurationMs);
                $tempPaths[] = $mixedAudio;
                $finalOutput = $ffmpeg->mergeAudioVideo($concatenated, $mixedAudio);
            } elseif ($sceneAudio) {
                $finalOutput = $ffmpeg->mergeAudioVideo($concatenated, $sceneAudio);
            } elseif (! empty($audioTracks)) {
                $mixedAudio = $ffmpeg->mixAudioTracks($audioTracks, $totalDurationMs, $scenes, $project->fps);
                $tempPaths[] = $mixedAudio;
                $finalOutput = $ffmpeg->mergeAudioVideo($concatenated, $mixedAudio);
            }

            $tempPaths[] = $finalOutput;

            $this->publish($finalOutput);
        } catch (\Throwable $e) {
            // The raw message can be ffmpeg stderr containing absolute server
            // paths; keep it in the log and hand the client a safe summary.
            Log::error('Render failed', [
                'render_id' => $this->render->id,
                'project_id' => $this->render->project_id,
                'error' => $e->getMessage(),
                'exception' => $e,
            ]);

            $this->render->update([
                'status' => RenderStatus::Failed,
                'error_message' => $this->sanitizeErrorMessage($e),
                'completed_at' => now(),
            ]);

            $this->updateAgentActivity('failed');

            throw $e;
        } finally {
            // The headless service names its own intermediates, and it creates
            // them before it can fail, so they are collected here rather than
            // at the call site -- otherwise a browser that crashed mid-encode
            // would leave its partial mp4 behind.
            foreach (array_merge($tempPaths, $headless->tempPaths()) as $tempPath) {
                @unlink($tempPath);
            }

            // Clean up any temp files downloaded from remote storage
            Asset::cleanupTempFiles();
        }
    }

    /**
     * Whether this render uses headless Chrome instead of the ffmpeg filtergraph.
     */
    protected function usesHeadlessDriver(): bool
    {
        return config('render.driver') === 'headless';
    }

    /**
     * Render the project with the REAL compositor, in headless Chrome.
     *
     * This path is the browser export run server-side: one call produces the
     * finished MP4 with video and audio already muxed, because the page mixes
     * the project's audio itself with the same planProjectAudio() gain staging
     * the preview uses. Nothing downstream of here touches ffmpeg.
     */
    protected function renderWithHeadlessChrome(HeadlessRenderService $headless, Project $project): string
    {
        $result = $headless->render(
            $project,
            $this->render->id,
            function (int $percent, string $phase): void {
                // The browser reports 0-100 over the whole export; map it onto
                // the 10-95 band the polling UI already expects between
                // "compositing started" and "stored".
                $this->render->update([
                    'status' => $phase === 'audio' ? RenderStatus::Mixing : RenderStatus::Compositing,
                    'progress' => 10 + (int) round($percent * 0.85),
                ]);
            },
        );

        if ($result['warnings'] !== []) {
            Log::warning('Headless render completed with warnings', [
                'render_id' => $this->render->id,
                'warnings' => $result['warnings'],
            ]);
        }

        return $result['path'];
    }

    /**
     * Store the finished file and mark the render complete.
     *
     * Shared by both drivers so the status, progress and agent-notification
     * semantics cannot drift between them -- get_render_status and the polling
     * UI see exactly the same sequence whichever compositor produced the file.
     */
    protected function publish(string $finalOutput): void
    {
        $storagePath = 'renders/final_'.Str::uuid().'.mp4';
        $this->storeFinalOutput($finalOutput, $storagePath);

        $this->render->update([
            'status' => RenderStatus::Completed,
            'progress' => 100,
            'output_path' => $storagePath,
            'completed_at' => now(),
        ]);

        $this->updateAgentActivity('completed');
    }

    /**
     * Stream the finished render into permanent storage.
     *
     * Streamed rather than read into a string: a long render easily exceeds the
     * worker's PHP memory_limit, and OOM-ing here would throw away all the
     * encoding work at the very last step.
     */
    protected function storeFinalOutput(string $finalOutput, string $storagePath): void
    {
        $handle = fopen($finalOutput, 'rb');

        if ($handle === false) {
            throw new \RuntimeException('Unable to open the rendered file for upload.');
        }

        try {
            Storage::writeStream($storagePath, $handle);
        } finally {
            if (is_resource($handle)) {
                fclose($handle);
            }
        }
    }

    /**
     * Turn an internal failure into a message that is safe to show the user.
     *
     * ffmpeg stderr leaks absolute server paths and internal filtergraphs, so
     * only messages we raise ourselves (validation, empty project) are passed
     * through verbatim; everything else becomes a generic summary.
     */
    protected function sanitizeErrorMessage(\Throwable $e): string
    {
        $message = $e->getMessage();

        foreach (self::SAFE_ERROR_PREFIXES as $prefix) {
            if (str_starts_with($message, $prefix)) {
                return $message;
            }
        }

        return 'The render failed while processing your project. Please try again; '
            .'if the problem persists, contact support and quote render #'.$this->render->id.'.';
    }

    protected function updateAgentActivity(string $status): void
    {
        $activity = AgentActivity::query()
            ->where('type', 'render')
            ->where('payload->render_id', $this->render->id)
            ->first();

        if ($activity === null) {
            return;
        }

        $activity->update([
            'status' => $status,
            'payload' => array_merge($activity->payload ?? [], [
                'status' => $status,
                'output_url' => $this->render->output_url,
                'error_message' => $this->render->error_message,
                'message' => $status === 'completed' ? 'Video render completed. Returning the final result to the agent…' : 'Video render failed. Returning the failure to the agent…',
            ]),
            'finished_at' => now(),
        ]);

        AgentActivityUpdated::dispatch($activity);
        $this->continueAgentConversation($activity, $status);
    }

    protected function continueAgentConversation(AgentActivity $activity, string $status): void
    {
        if ($activity->conversation_id === null || $activity->user_id === null) {
            return;
        }

        ContinueAgentConversation::dispatch(
            (string) $activity->conversation_id,
            (int) $activity->user_id,
            json_encode([
                'event' => 'render_finished',
                'render_id' => $this->render->id,
                'project_id' => $this->render->project_id,
                'status' => $status,
                'output_url' => $this->render->output_url,
                'error_message' => $this->render->error_message,
                'instruction' => 'Continue the orchestrated video creation workflow from this async CreatorAgent render result. Tell the user whether the render completed, include the final output URL if available, and suggest the next edit only if useful.',
            ], JSON_THROW_ON_ERROR),
        );
    }

    /**
     * Validate that all asset files referenced by the project exist on disk.
     */
    protected function validateAssetFiles(Project $project): void
    {
        $assetIds = collect();

        // Collect asset IDs from scene layers
        foreach ($project->scenes ?? [] as $scene) {
            foreach ($scene['layers'] ?? [] as $layer) {
                if (! empty($layer['asset_id'])) {
                    $assetIds->push($layer['asset_id']);
                }
            }
        }

        // Collect asset IDs from audio tracks
        foreach ($project->audio_tracks ?? [] as $track) {
            foreach ($track['clips'] ?? [] as $clip) {
                if (! empty($clip['asset_id'])) {
                    $assetIds->push($clip['asset_id']);
                }
            }
        }

        // Collect asset IDs from video tracks
        foreach ($project->video_tracks ?? [] as $track) {
            foreach ($track['clips'] ?? [] as $clip) {
                if (! empty($clip['asset_id'])) {
                    $assetIds->push($clip['asset_id']);
                }
            }
        }

        $assetIds = $assetIds->unique()->values();

        if ($assetIds->isEmpty()) {
            return;
        }

        $assets = Asset::whereIn('id', $assetIds)->get();
        $missing = [];

        foreach ($assets as $asset) {
            if (! Storage::disk($asset->disk)->exists($asset->path)) {
                $missing[] = "{$asset->name} (ID: {$asset->id}, path: {$asset->path})";
            }
        }

        if (! empty($missing)) {
            throw new \RuntimeException(
                'Asset files not found on disk: '.implode(', ', $missing).
                '. Files may have been lost during deployment. Please re-upload the missing assets.'
            );
        }
    }
}
