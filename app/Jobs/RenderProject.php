<?php

namespace App\Jobs;

use App\Enums\RenderStatus;
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
                $finalOutput = $ffmpeg->mergeAudioVideo($concatenated, $mixedAudio);
            }

            // Move to permanent storage and store a relative path
            $storagePath = 'renders/final_'.Str::uuid().'.mp4';
            Storage::put($storagePath, file_get_contents($finalOutput));
            @unlink($finalOutput);

            $this->render->update([
                'status' => RenderStatus::Completed,
                'progress' => 100,
                'output_path' => $storagePath,
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
}
