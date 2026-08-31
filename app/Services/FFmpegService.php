<?php

namespace App\Services;

use App\Models\Asset;
use App\Models\Project;
use App\Services\Subtitles\AssSubtitleBuilder;
use Illuminate\Support\Facades\Process;
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

        // Sort layers by z_index so lower values are rendered first (background)
        usort($layers, fn ($a, $b) => ($a['z_index'] ?? 0) <=> ($b['z_index'] ?? 0));

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
        $command[] = '-profile:v';
        $command[] = 'high';
        $command[] = '-level';
        $command[] = '4.0';
        $command[] = '-pix_fmt';
        $command[] = 'yuv420p';
        $command[] = '-preset';
        $command[] = 'fast';
        $command[] = '-movflags';
        $command[] = '+faststart';
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

            $inputs[] = $asset->getLocalPath();
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
            $layerX = $layer['x'] ?? 0;
            $layerY = $layer['y'] ?? 0;
            $layerWidth = $layer['width'] ?? 100;
            $layerHeight = $layer['height'] ?? 50;
            $fontSize = $layer['font_size'] ?? 48;
            $fontColor = $layer['font_color'] ?? 'white';
            $strokeWidth = $layer['stroke_width'] ?? 0;
            $strokeColor = $layer['stroke_color'] ?? 'black';

            // Convert hex colors to FFmpeg format
            $fontColor = $this->hexToFfmpegColor($fontColor);
            $strokeColor = $this->hexToFfmpegColor($strokeColor);

            // Center text within layer bounds (matching preview behavior)
            // FFmpeg x/y positions the top-left of the text bounding box
            // To center: x = layer_x + (layer_width - text_w) / 2
            $centerX = (int) ($layerX + $layerWidth / 2);
            $centerY = (int) ($layerY + $layerHeight / 2);
            $xExpr = "({$centerX}-text_w/2)";
            $yExpr = "({$centerY}-text_h/2)";

            $outputLabel = '[text'.$inputIndex.']';

            // Build drawtext filter with optional stroke/border
            $drawtextParams = sprintf(
                "text='%s':fontsize=%d:fontcolor=%s:x=%s:y=%s",
                $this->escapeDrawtext($text),
                $fontSize,
                $fontColor,
                $xExpr,
                $yExpr
            );

            if ($strokeWidth > 0) {
                $drawtextParams .= sprintf(':borderw=%d:bordercolor=%s', $strokeWidth, $strokeColor);
            }

            $filterComplex[] = sprintf(
                '%sdrawtext=%s%s',
                $currentBase,
                $drawtextParams,
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

                $inputs[] = $asset->getLocalPath();
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
            '-c:v', 'libx264',
            '-profile:v', 'high',
            '-level', '4.0',
            '-pix_fmt', 'yuv420p',
            '-preset', 'fast',
            '-c:a', 'aac',
            '-ar', '44100',
            '-b:a', '128k',
            '-movflags', '+faststart',
            '-brand', 'mp42',
            '-shortest',
            $outputPath,
        ]);

        if (! $result->successful()) {
            throw new \RuntimeException('Audio/video merge failed: '.$result->errorOutput());
        }

        @unlink($videoPath);
        @unlink($audioPath);

        return $outputPath;
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
            '-profile:v', 'high',
            '-level', '4.0',
            '-pix_fmt', 'yuv420p',
            '-preset', 'fast',
            '-movflags', '+faststart',
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
        $overlayIndex = 1;

        foreach ($videoTracks as $track) {
            $visible = $track['visible'] ?? true;
            if (! $visible) {
                continue;
            }

            $clips = $track['clips'] ?? [];

            foreach ($clips as $clipIndex => $clip) {
                $startSec = ($clip['start_ms'] ?? 0) / 1000;
                $endSec = $startSec + (($clip['duration_ms'] ?? 5000) / 1000);
                $x = $clip['x'] ?? 0;
                $y = $clip['y'] ?? 0;
                $width = $clip['width'] ?? 320;
                $height = $clip['height'] ?? 180;
                $opacity = $clip['opacity'] ?? 1.0;
                $overlayOutput = '[out'.$overlayIndex.']';

                if (($clip['type'] ?? 'video') === 'text') {
                    $fontColor = $this->hexToFfmpegColor($clip['font_color'] ?? '#ffffff');
                    $backgroundColor = $this->hexToFfmpegColor($clip['background_color'] ?? '#00000080');
                    $fontSize = $clip['font_size'] ?? 48;
                    $strokeWidth = $clip['stroke_width'] ?? 0;
                    $strokeColor = $this->hexToFfmpegColor($clip['stroke_color'] ?? '#000000');
                    $text = $this->escapeDrawtext($clip['text'] ?? 'Text Overlay');
                    $strokeParams = $strokeWidth > 0 ? sprintf(':borderw=%d:bordercolor=%s', $strokeWidth, $strokeColor) : '';

                    $filterComplex[] = sprintf(
                        "%sdrawtext=text='%s':fontsize=%d:fontcolor=%s:x=%d+(%d-text_w)/2:y=%d+(%d-text_h)/2:box=1:boxcolor=%s:boxborderw=12%s:enable='between(t,%f,%f)'%s",
                        $currentBase,
                        $text,
                        $fontSize,
                        $fontColor,
                        $x,
                        $width,
                        $y,
                        $height,
                        $backgroundColor,
                        $strokeParams,
                        $startSec,
                        $endSec,
                        $overlayOutput
                    );

                    $currentBase = $overlayOutput;
                    $overlayIndex++;

                    continue;
                }

                $assetId = $clip['asset_id'] ?? null;
                if (! $assetId) {
                    continue;
                }

                $asset = Asset::find($assetId);
                if (! $asset) {
                    continue;
                }

                $inputs[] = $asset->getLocalPath();

                $scaledLabel = '[scaled'.$inputIndex.']';

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
                $overlayIndex++;
            }
        }

        // If no overlays were added, just return the input
        if ($filterComplex === []) {
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
        $command[] = '-profile:v';
        $command[] = 'high';
        $command[] = '-level';
        $command[] = '4.0';
        $command[] = '-pix_fmt';
        $command[] = 'yuv420p';
        $command[] = '-preset';
        $command[] = 'fast';
        $command[] = '-c:a';
        $command[] = 'copy';
        $command[] = '-movflags';
        $command[] = '+faststart';
        $command[] = $outputPath;

        $result = Process::timeout(600)->run($command);

        if (! $result->successful()) {
            throw new \RuntimeException('Video track overlay failed: '.$result->errorOutput());
        }

        // Clean up the input file
        @unlink($inputPath);

        return $outputPath;
    }

    /**
     * Burn subtitle tracks onto the video using a generated ASS subtitle file.
     *
     * ASS is used (over drawtext) so we get proper text wrapping, outlines,
     * background boxes, and word-level karaoke highlighting. The style
     * font_size maps 1:1 to pixels via PlayResX/PlayResY set to the project
     * resolution.
     *
     * @param  array<array<string, mixed>>  $subtitleTracks
     */
    public function burnSubtitles(string $inputPath, array $subtitleTracks, Project $project): string
    {
        $assContent = (new AssSubtitleBuilder)->build(
            $subtitleTracks,
            $project->resolution_width,
            $project->resolution_height,
        );

        // No renderable subtitles: leave the input untouched.
        if (! str_contains($assContent, 'Dialogue:')) {
            return $inputPath;
        }

        $assPath = $this->getTempPath('subtitles_'.Str::uuid().'.ass');
        file_put_contents($assPath, $assContent);

        $outputPath = $this->getTempPath('subtitled_'.Str::uuid().'.mp4');

        $command = [
            'ffmpeg', '-y',
            '-i', $inputPath,
            '-vf', "ass='".$this->escapeAssFilterPath($assPath)."'",
            '-c:v', 'libx264',
            '-profile:v', 'high',
            '-level', '4.0',
            '-pix_fmt', 'yuv420p',
            '-preset', 'fast',
            '-c:a', 'copy',
            '-movflags', '+faststart',
            $outputPath,
        ];

        $result = Process::timeout(600)->run($command);

        // Always remove the temporary subtitle file.
        @unlink($assPath);

        if (! $result->successful()) {
            throw new \RuntimeException('Subtitle burn failed: '.$result->errorOutput());
        }

        // Clean up input file
        @unlink($inputPath);

        return $outputPath;
    }

    /**
     * Escape a file path for use inside an ffmpeg filtergraph value.
     *
     * Backslashes, colons (option separators), and single quotes (value
     * delimiters) must be escaped.
     */
    protected function escapeAssFilterPath(string $path): string
    {
        return str_replace(
            ['\\', ':', "'"],
            ['\\\\', '\\:', "\\'"],
            $path
        );
    }

    /**
     * Escape text for use in FFmpeg drawtext filter.
     *
     * FFmpeg drawtext requires escaping:
     * - Backslashes (\) must be escaped first
     * - Colons (:) are option separators
     * - Single quotes (') delimit text values
     * - Percent signs (%) are used for text expansion
     */
    protected function escapeDrawtext(string $text): string
    {
        return str_replace(
            ['\\', ':', "'", '%'],
            ['\\\\', '\\:', "\\'", '%%'],
            $text
        );
    }

    /**
     * Convert hex color (with optional alpha) to FFmpeg-compatible format.
     */
    protected function hexToFfmpegColor(string $color): string
    {
        // Already in a valid FFmpeg format (named color or no #)
        if (! str_starts_with($color, '#')) {
            return $color;
        }

        // #RRGGBBAA -> 0xRRGGBBAA (FFmpeg format)
        return '0x'.ltrim($color, '#');
    }

    /**
     * Mix two audio files together.
     */
    public function mixTwoAudioFiles(string $audio1, string $audio2, int $totalDurationMs): string
    {
        $outputPath = $this->getTempPath('mixed_'.Str::uuid().'.mp3');
        $durationSec = $totalDurationMs / 1000;

        $result = Process::timeout(300)->run([
            'ffmpeg', '-y',
            '-i', $audio1,
            '-i', $audio2,
            '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=longest[aout]',
            '-map', '[aout]',
            '-t', (string) $durationSec,
            $outputPath,
        ]);

        @unlink($audio1);
        @unlink($audio2);

        if (! $result->successful()) {
            throw new \RuntimeException('Audio mixing failed: '.$result->errorOutput());
        }

        return $outputPath;
    }

    /**
     * Extract audio from video layers in scenes.
     *
     * @param  array<array<string, mixed>>  $scenes
     */
    public function extractSceneAudio(array $scenes): ?string
    {
        $inputs = [];
        $filterComplex = [];
        $mixInputs = [];
        $inputIndex = 0;
        $currentTimeMs = 0;

        foreach ($scenes as $scene) {
            $sceneDurationMs = $scene['duration_ms'] ?? 5000;
            $layers = $scene['layers'] ?? [];

            foreach ($layers as $layer) {
                $type = $layer['type'] ?? null;
                $assetId = $layer['asset_id'] ?? null;

                if ($type !== 'video' || ! $assetId) {
                    continue;
                }

                $asset = Asset::find($assetId);
                if (! $asset) {
                    continue;
                }

                $inputs[] = $asset->getLocalPath();
                $outputLabel = '[a'.$inputIndex.']';

                // Extract audio, trim to scene duration, delay to scene start time
                $filter = sprintf(
                    '[%d:a]atrim=0:%f,adelay=%d|%d,asetpts=PTS-STARTPTS%s',
                    $inputIndex,
                    $sceneDurationMs / 1000,
                    $currentTimeMs,
                    $currentTimeMs,
                    $outputLabel
                );

                $filterComplex[] = $filter;
                $mixInputs[] = $outputLabel;
                $inputIndex++;
            }

            $currentTimeMs += $sceneDurationMs;
        }

        if (empty($mixInputs)) {
            return null;
        }

        $outputPath = $this->getTempPath('scene_audio_'.Str::uuid().'.mp3');

        if (count($mixInputs) === 1) {
            $filterComplex[] = $mixInputs[0].'anull[aout]';
        } else {
            $filterComplex[] = implode('', $mixInputs).'amix=inputs='.count($mixInputs).':duration=longest[aout]';
        }

        $command = ['ffmpeg', '-y'];

        foreach ($inputs as $input) {
            $command[] = '-i';
            $command[] = $input;
        }

        $command[] = '-filter_complex';
        $command[] = implode(';', $filterComplex);
        $command[] = '-map';
        $command[] = '[aout]';
        $command[] = $outputPath;

        $result = Process::timeout(300)->run($command);

        if (! $result->successful()) {
            // Video might not have audio track - this is not fatal
            return null;
        }

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
