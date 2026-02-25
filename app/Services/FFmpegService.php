<?php

namespace App\Services;

use App\Models\Asset;
use App\Models\Project;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class FFmpegService
{
    /**
     * Render a single scene to a video file.
     *
     * @param  array<string, mixed>  $scene
     */
    public function renderScene(Project $project, array $scene): string
    {
        $outputPath = $this->getTempPath('scene_'.($scene['id'] ?? Str::uuid()).'.mp4');
        $durationMs = $scene['duration_ms'] ?? 5000;
        $durationSec = $durationMs / 1000;

        $layers = $scene['layers'] ?? [];

        if (empty($layers)) {
            return $this->createBlankVideo(
                $project->resolution_width,
                $project->resolution_height,
                $durationSec,
                $project->fps,
                $outputPath
            );
        }

        $filterComplex = [];
        $inputs = [];
        $inputIndex = 0;

        $filterComplex[] = sprintf(
            'color=c=black:s=%dx%d:d=%f:r=%d[base]',
            $project->resolution_width,
            $project->resolution_height,
            $durationSec,
            $project->fps
        );

        $currentBase = '[base]';

        foreach ($layers as $layerIndex => $layer) {
            $layerResult = $this->processLayer(
                $layer,
                $inputIndex,
                $currentBase,
                $project,
                $durationSec,
                $inputs,
                $filterComplex
            );

            if ($layerResult !== null) {
                $currentBase = $layerResult;
                $inputIndex = count($inputs);
            }
        }

        $command = ['ffmpeg', '-y'];

        foreach ($inputs as $input) {
            $command[] = '-i';
            $command[] = $input;
        }

        $command[] = '-filter_complex';
        $command[] = implode(';', $filterComplex);
        $command[] = '-map';
        $command[] = $currentBase;
        $command[] = '-c:v';
        $command[] = 'libx264';
        $command[] = '-preset';
        $command[] = 'fast';
        $command[] = '-t';
        $command[] = (string) $durationSec;
        $command[] = $outputPath;

        $result = Process::timeout(300)->run($command);

        if (! $result->successful()) {
            throw new \RuntimeException('Scene render failed: '.$result->errorOutput());
        }

        return $outputPath;
    }

    /**
     * @param  array<string, mixed>  $layer
     * @param  array<string>  $inputs
     * @param  array<string>  $filterComplex
     */
    protected function processLayer(
        array $layer,
        int $inputIndex,
        string $currentBase,
        Project $project,
        float $durationSec,
        array &$inputs,
        array &$filterComplex
    ): ?string {
        $type = $layer['type'] ?? null;
        $assetId = $layer['asset_id'] ?? null;

        if ($type === 'video' || $type === 'image') {
            if (! $assetId) {
                return null;
            }

            $asset = Asset::find($assetId);
            if (! $asset) {
                return null;
            }

            $inputs[] = $asset->full_path;
            $idx = count($inputs) - 1;

            $x = $layer['x'] ?? 0;
            $y = $layer['y'] ?? 0;
            $width = $layer['width'] ?? $project->resolution_width;
            $height = $layer['height'] ?? $project->resolution_height;

            $outputLabel = '[layer'.$idx.']';
            $overlayOutput = '[out'.$idx.']';

            if ($type === 'video') {
                $filterComplex[] = sprintf(
                    '[%d:v]scale=%d:%d,setpts=PTS-STARTPTS%s',
                    $idx,
                    $width,
                    $height,
                    $outputLabel
                );
            } else {
                $filterComplex[] = sprintf(
                    '[%d:v]scale=%d:%d,loop=loop=-1:size=1:start=0%s',
                    $idx,
                    $width,
                    $height,
                    $outputLabel
                );
            }

            $filterComplex[] = sprintf(
                '%s%soverlay=%d:%d:shortest=1%s',
                $currentBase,
                $outputLabel,
                $x,
                $y,
                $overlayOutput
            );

            return $overlayOutput;
        }

        if ($type === 'text') {
            $text = $layer['text'] ?? '';
            $x = $layer['x'] ?? '(w-text_w)/2';
            $y = $layer['y'] ?? '(h-text_h)/2';
            $fontSize = $layer['font_size'] ?? 48;
            $fontColor = $layer['font_color'] ?? 'white';

            $outputLabel = '[text'.$inputIndex.']';

            $filterComplex[] = sprintf(
                "%sdrawtext=text='%s':fontsize=%d:fontcolor=%s:x=%s:y=%s%s",
                $currentBase,
                addslashes($text),
                $fontSize,
                $fontColor,
                $x,
                $y,
                $outputLabel
            );

            return $outputLabel;
        }

        return null;
    }

    /**
     * Concatenate multiple videos into one.
     *
     * @param  array<string>  $videoPaths
     */
    public function concatenateVideos(array $videoPaths): string
    {
        if (count($videoPaths) === 1) {
            return $videoPaths[0];
        }

        $outputPath = $this->getTempPath('concat_'.Str::uuid().'.mp4');
        $listPath = $this->getTempPath('concat_list_'.Str::uuid().'.txt');

        $listContent = '';
        foreach ($videoPaths as $path) {
            $listContent .= "file '".addslashes($path)."'\n";
        }

        file_put_contents($listPath, $listContent);

        $result = Process::timeout(600)->run([
            'ffmpeg', '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', $listPath,
            '-c', 'copy',
            $outputPath,
        ]);

        @unlink($listPath);

        if (! $result->successful()) {
            throw new \RuntimeException('Video concatenation failed: '.$result->errorOutput());
        }

        return $outputPath;
    }

    /**
     * Mix multiple audio tracks together.
     *
     * @param  array<array<string, mixed>>  $audioTracks
     */
    public function mixAudioTracks(array $audioTracks, int $totalDurationMs): string
    {
        $outputPath = $this->getTempPath('audio_mix_'.Str::uuid().'.mp3');
        $durationSec = $totalDurationMs / 1000;

        $inputs = [];
        $filterComplex = [];
        $mixInputs = [];
        $inputIndex = 0;

        foreach ($audioTracks as $track) {
            $clips = $track['clips'] ?? [];
            $trackVolume = $track['volume'] ?? 1.0;

            foreach ($clips as $clip) {
                $assetId = $clip['asset_id'] ?? null;
                if (! $assetId) {
                    continue;
                }

                $asset = Asset::find($assetId);
                if (! $asset) {
                    continue;
                }

                $inputs[] = $asset->full_path;
                $startMs = $clip['start_ms'] ?? 0;
                $clipDurationMs = $clip['duration_ms'] ?? ($asset->duration_ms ?? 10000);
                $trimStartMs = $clip['trim_start_ms'] ?? 0;
                $volume = ($clip['volume'] ?? 1.0) * $trackVolume;

                $delayMs = $startMs;
                $outputLabel = '[a'.$inputIndex.']';

                $filter = sprintf(
                    '[%d:a]atrim=start=%f:duration=%f,adelay=%d|%d,volume=%f%s',
                    $inputIndex,
                    $trimStartMs / 1000,
                    $clipDurationMs / 1000,
                    $delayMs,
                    $delayMs,
                    $volume,
                    $outputLabel
                );

                $filterComplex[] = $filter;
                $mixInputs[] = $outputLabel;
                $inputIndex++;
            }
        }

        if (empty($mixInputs)) {
            return $this->createSilentAudio($durationSec, $outputPath);
        }

        $filterComplex[] = implode('', $mixInputs).'amix=inputs='.count($mixInputs).':duration=longest[aout]';

        $command = ['ffmpeg', '-y'];

        foreach ($inputs as $input) {
            $command[] = '-i';
            $command[] = $input;
        }

        $command[] = '-filter_complex';
        $command[] = implode(';', $filterComplex);
        $command[] = '-map';
        $command[] = '[aout]';
        $command[] = '-t';
        $command[] = (string) $durationSec;
        $command[] = $outputPath;

        $result = Process::timeout(300)->run($command);

        if (! $result->successful()) {
            throw new \RuntimeException('Audio mixing failed: '.$result->errorOutput());
        }

        return $outputPath;
    }

    /**
     * Merge video and audio into final output.
     */
    public function mergeAudioVideo(string $videoPath, string $audioPath): string
    {
        $outputPath = $this->getTempPath('final_'.Str::uuid().'.mp4');

        $result = Process::timeout(300)->run([
            'ffmpeg', '-y',
            '-i', $videoPath,
            '-i', $audioPath,
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-shortest',
            $outputPath,
        ]);

        if (! $result->successful()) {
            throw new \RuntimeException('Audio/video merge failed: '.$result->errorOutput());
        }

        $rendersPath = 'renders/'.basename($outputPath);
        Storage::put($rendersPath, file_get_contents($outputPath));

        @unlink($outputPath);
        @unlink($videoPath);
        @unlink($audioPath);

        return $rendersPath;
    }

    protected function createBlankVideo(
        int $width,
        int $height,
        float $durationSec,
        int $fps,
        string $outputPath
    ): string {
        $result = Process::timeout(60)->run([
            'ffmpeg', '-y',
            '-f', 'lavfi',
            '-i', sprintf('color=c=black:s=%dx%d:d=%f:r=%d', $width, $height, $durationSec, $fps),
            '-c:v', 'libx264',
            '-preset', 'fast',
            $outputPath,
        ]);

        if (! $result->successful()) {
            throw new \RuntimeException('Blank video creation failed: '.$result->errorOutput());
        }

        return $outputPath;
    }

    protected function createSilentAudio(float $durationSec, string $outputPath): string
    {
        $result = Process::timeout(30)->run([
            'ffmpeg', '-y',
            '-f', 'lavfi',
            '-i', 'anullsrc=r=44100:cl=stereo',
            '-t', (string) $durationSec,
            $outputPath,
        ]);

        if (! $result->successful()) {
            throw new \RuntimeException('Silent audio creation failed: '.$result->errorOutput());
        }

        return $outputPath;
    }

    /**
     * Overlay video tracks on top of the concatenated video.
     *
     * @param  array<array<string, mixed>>  $videoTracks
     */
    public function overlayVideoTracks(string $inputPath, array $videoTracks, Project $project): string
    {
        $outputPath = $this->getTempPath('overlaid_'.Str::uuid().'.mp4');

        $inputs = [$inputPath];
        $filterComplex = [];
        $currentBase = '[0:v]';
        $inputIndex = 1;

        foreach ($videoTracks as $track) {
            $visible = $track['visible'] ?? true;
            if (! $visible) {
                continue;
            }

            $clips = $track['clips'] ?? [];

            foreach ($clips as $clipIndex => $clip) {
                $assetId = $clip['asset_id'] ?? null;
                if (! $assetId) {
                    continue;
                }

                $asset = Asset::find($assetId);
                if (! $asset) {
                    continue;
                }

                $inputs[] = $asset->full_path;

                $startSec = ($clip['start_ms'] ?? 0) / 1000;
                $endSec = $startSec + (($clip['duration_ms'] ?? 5000) / 1000);
                $x = $clip['x'] ?? 0;
                $y = $clip['y'] ?? 0;
                $width = $clip['width'] ?? 320;
                $height = $clip['height'] ?? 180;
                $opacity = $clip['opacity'] ?? 1.0;

                $scaledLabel = '[scaled'.$inputIndex.']';
                $overlayOutput = '[out'.$inputIndex.']';

                // Scale the overlay video
                $filterComplex[] = sprintf(
                    '[%d:v]scale=%d:%d,setpts=PTS-STARTPTS%s',
                    $inputIndex,
                    $width,
                    $height,
                    $scaledLabel
                );

                // Apply opacity if not 1.0
                $inputLabel = $scaledLabel;
                if ($opacity < 1.0) {
                    $alphaLabel = '[alpha'.$inputIndex.']';
                    $filterComplex[] = sprintf(
                        '%sformat=rgba,colorchannelmixer=aa=%f%s',
                        $scaledLabel,
                        $opacity,
                        $alphaLabel
                    );
                    $inputLabel = $alphaLabel;
                }

                // Overlay with time-based enable expression
                $filterComplex[] = sprintf(
                    "%s%soverlay=%d:%d:enable='between(t,%f,%f)'%s",
                    $currentBase,
                    $inputLabel,
                    $x,
                    $y,
                    $startSec,
                    $endSec,
                    $overlayOutput
                );

                $currentBase = $overlayOutput;
                $inputIndex++;
            }
        }

        // If no overlays were added, just return the input
        if (count($inputs) === 1) {
            return $inputPath;
        }

        $command = ['ffmpeg', '-y'];

        foreach ($inputs as $input) {
            $command[] = '-i';
            $command[] = $input;
        }

        $command[] = '-filter_complex';
        $command[] = implode(';', $filterComplex);
        $command[] = '-map';
        $command[] = $currentBase;
        $command[] = '-map';
        $command[] = '0:a?';
        $command[] = '-c:v';
        $command[] = 'libx264';
        $command[] = '-preset';
        $command[] = 'fast';
        $command[] = '-c:a';
        $command[] = 'copy';
        $command[] = $outputPath;

        $result = Process::timeout(600)->run($command);

        if (! $result->successful()) {
            throw new \RuntimeException('Video track overlay failed: '.$result->errorOutput());
        }

        // Clean up the input file
        @unlink($inputPath);

        return $outputPath;
    }

    protected function getTempPath(string $filename): string
    {
        $tempDir = storage_path('app/temp');

        if (! is_dir($tempDir)) {
            mkdir($tempDir, 0755, true);
        }

        return $tempDir.'/'.$filename;
    }
}
