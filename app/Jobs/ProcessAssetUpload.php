<?php

namespace App\Jobs;

use App\Enums\AssetType;
use App\Models\Asset;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ProcessAssetUpload implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $backoff = 30;

    /**
     * Create a new job instance.
     */
    public function __construct(public Asset $asset) {}

    /**
     * Execute the job.
     */
    public function handle(): void
    {
        $fullPath = $this->asset->full_path;

        if (! file_exists($fullPath)) {
            Log::warning('Asset file not found', ['asset_id' => $this->asset->id, 'path' => $fullPath]);

            return;
        }

        $updates = [];

        if ($this->asset->type === AssetType::Video) {
            $updates = $this->processVideo($fullPath);
        } elseif ($this->asset->type === AssetType::Audio) {
            $updates = $this->processAudio($fullPath);
        } elseif ($this->asset->type === AssetType::Image) {
            $updates = $this->processImage($fullPath);
        }

        if (! empty($updates)) {
            $this->asset->update($updates);
        }
    }

    /**
     * @return array<string, mixed>
     */
    protected function processVideo(string $fullPath): array
    {
        $updates = [];

        $result = Process::run([
            'ffprobe',
            '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height,duration',
            '-show_entries', 'format=duration',
            '-of', 'json',
            $fullPath,
        ]);

        if ($result->successful()) {
            $data = json_decode($result->output(), true);

            if (isset($data['streams'][0])) {
                $stream = $data['streams'][0];
                $updates['width'] = (int) ($stream['width'] ?? 0);
                $updates['height'] = (int) ($stream['height'] ?? 0);
            }

            $duration = $data['streams'][0]['duration']
                ?? $data['format']['duration']
                ?? null;

            if ($duration !== null) {
                $updates['duration_ms'] = (int) (floatval($duration) * 1000);
            }
        }

        $thumbnailPath = $this->generateVideoThumbnail($fullPath);
        if ($thumbnailPath) {
            $updates['thumbnail_path'] = $thumbnailPath;
        }

        return $updates;
    }

    /**
     * @return array<string, mixed>
     */
    protected function processAudio(string $fullPath): array
    {
        $updates = [];

        $result = Process::run([
            'ffprobe',
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'json',
            $fullPath,
        ]);

        if ($result->successful()) {
            $data = json_decode($result->output(), true);

            if (isset($data['format']['duration'])) {
                $updates['duration_ms'] = (int) (floatval($data['format']['duration']) * 1000);
            }
        }

        return $updates;
    }

    /**
     * @return array<string, mixed>
     */
    protected function processImage(string $fullPath): array
    {
        $updates = [];

        $size = getimagesize($fullPath);
        if ($size !== false) {
            $updates['width'] = $size[0];
            $updates['height'] = $size[1];
        }

        return $updates;
    }

    protected function generateVideoThumbnail(string $videoPath): ?string
    {
        $thumbnailFilename = Str::uuid().'.jpg';
        $thumbnailDir = dirname($this->asset->path);
        $thumbnailPath = $thumbnailDir.'/thumbnails/'.$thumbnailFilename;

        $fullThumbnailPath = Storage::disk($this->asset->disk)->path($thumbnailPath);
        $thumbnailDirectory = dirname($fullThumbnailPath);

        if (! is_dir($thumbnailDirectory)) {
            mkdir($thumbnailDirectory, 0755, true);
        }

        $result = Process::run([
            'ffmpeg',
            '-i', $videoPath,
            '-ss', '00:00:01',
            '-vframes', '1',
            '-vf', 'scale=320:-1',
            '-y',
            $fullThumbnailPath,
        ]);

        if ($result->successful() && file_exists($fullThumbnailPath)) {
            return $thumbnailPath;
        }

        return null;
    }
}
