<?php

namespace App\Jobs;

use App\Enums\RenderStatus;
use App\Models\Asset;
use App\Models\Render;
use App\Services\FFmpegService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class RenderProject implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout = 3600;

    /**
     * Create a new job instance.
     */
    public function __construct(public Render $render) {}

    /**
     * Execute the job.
     */
    public function handle(FFmpegService $ffmpeg): void
    {
        $this->render->update([
            'status' => RenderStatus::Processing,
            'started_at' => now(),
        ]);

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

            $sceneVideos = [];
            $totalScenes = count($scenes);

            foreach ($scenes as $index => $scene) {
                $sceneVideo = $ffmpeg->renderScene($project, $scene);
                $sceneVideos[] = $sceneVideo;

                $progress = 10 + (int) (($index + 1) / $totalScenes * 50);
                $this->render->update(['progress' => $progress]);
            }

            $this->render->update([
                'status' => RenderStatus::Mixing,
                'progress' => 70,
            ]);

            $concatenated = $ffmpeg->concatenateVideos($sceneVideos);

            // Apply video track overlays (PIP, watermarks, etc.)
            $videoTracks = $project->video_tracks ?? [];
            if (! empty($videoTracks)) {
                $this->render->update(['progress' => 75]);
                $concatenated = $ffmpeg->overlayVideoTracks($concatenated, $videoTracks, $project);
            }

            // Burn subtitles onto the video
            $subtitleTracks = $project->subtitle_tracks ?? [];
            if (! empty($subtitleTracks)) {
                $this->render->update(['progress' => 78]);
                $concatenated = $ffmpeg->burnSubtitles($concatenated, $subtitleTracks, $project);
            }

            $audioTracks = $project->audio_tracks ?? [];
            $totalDurationMs = array_sum(array_column($scenes, 'duration_ms'));

            $finalOutput = $concatenated;
            if (! empty($audioTracks)) {
                $mixedAudio = $ffmpeg->mixAudioTracks($audioTracks, $totalDurationMs);
                // mergeAudioVideo stores in Storage and returns a relative path
                $finalOutput = $ffmpeg->mergeAudioVideo($concatenated, $mixedAudio);
            } else {
                // Move temp file to permanent storage
                $storagePath = 'renders/final_'.Str::uuid().'.mp4';
                Storage::put($storagePath, file_get_contents($finalOutput));
                @unlink($finalOutput);
                $finalOutput = $storagePath;
            }

            $this->render->update([
                'status' => RenderStatus::Completed,
                'progress' => 100,
                'output_path' => $finalOutput,
                'completed_at' => now(),
            ]);

            foreach ($sceneVideos as $tempVideo) {
                @unlink($tempVideo);
            }
        } catch (\Throwable $e) {
            Log::error('Render failed', [
                'render_id' => $this->render->id,
                'error' => $e->getMessage(),
            ]);

            $this->render->update([
                'status' => RenderStatus::Failed,
                'error_message' => $e->getMessage(),
                'completed_at' => now(),
            ]);

            throw $e;
        }
    }

    /**
     * Validate that all asset files referenced by the project exist on disk.
     */
    protected function validateAssetFiles(\App\Models\Project $project): void
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
