<?php

namespace App\Services;

use App\Enums\TransitionType;
use App\Models\Asset;
use App\Models\Project;
use App\Services\Subtitles\AssSubtitleBuilder;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Str;

class FFmpegService
{
    /** Default duration of a scene transition when none is given. */
    public const DEFAULT_TRANSITION_MS = 500;

    /** Hard upper bound for a scene transition. */
    public const MAX_TRANSITION_MS = 1500;

    /** Slowest supported constant playback speed for video content. */
    public const MIN_SPEED = 0.25;

    /** Fastest supported constant playback speed for video content. */
    public const MAX_SPEED = 4.0;

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

        if (empty($scene['layers'] ?? [])) {
            return $this->createBlankVideo(
                $project->resolution_width,
                $project->resolution_height,
                $durationSec,
                $project->fps,
                $outputPath,
                $this->sceneBackgroundColor($scene)
            );
        }

        $graph = $this->buildSceneFilterGraph(
            $scene,
            $project->resolution_width,
            $project->resolution_height,
            $project->fps
        );

        $command = ['ffmpeg', '-y'];

        foreach ($graph['inputs'] as $input) {
            $command[] = '-i';
            $command[] = $input;
        }

        $command[] = '-filter_complex';
        $command[] = implode(';', $graph['filters']);
        $command[] = '-map';
        $command[] = $graph['output'];
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
     * Build the complete filtergraph for a single scene.
     *
     * Pure string/array construction: no ffmpeg process is started, which makes
     * the generated filtergraph directly testable.
     *
     * @param  array<string, mixed>  $scene
     * @param  (callable(mixed): (array{path: string, duration_ms?: int|null}|null))|null  $resolveAsset
     * @param  (callable(string|null, string|null): (string|null))|null  $resolveFont
     * @return array{filters: array<int, string>, inputs: array<int, string>, output: string}
     */
    public function buildSceneFilterGraph(
        array $scene,
        int $width,
        int $height,
        int $fps,
        ?callable $resolveAsset = null,
        ?callable $resolveFont = null
    ): array {
        $resolveAsset ??= $this->assetResolver();
        $resolveFont ??= $this->fontResolver();

        $durationSec = ($scene['duration_ms'] ?? 5000) / 1000;

        $layers = $scene['layers'] ?? [];

        // Sort layers by z_index so lower values are rendered first (background)
        usort($layers, fn ($a, $b) => ($a['z_index'] ?? 0) <=> ($b['z_index'] ?? 0));

        $filters = [sprintf(
            'color=c=%s:s=%dx%d:d=%f:r=%d[base]',
            $this->sceneBackgroundColor($scene),
            $width,
            $height,
            $durationSec,
            $fps
        )];

        $inputs = [];
        $currentBase = '[base]';
        $stageIndex = 0;

        foreach ($layers as $layer) {
            $type = $layer['type'] ?? null;

            if ($type === 'video' || $type === 'image') {
                $assetId = $layer['asset_id'] ?? null;
                if (! $assetId) {
                    continue;
                }

                $asset = $resolveAsset($assetId);
                if ($asset === null) {
                    continue;
                }

                $inputs[] = $asset['path'];
                $idx = count($inputs) - 1;

                $currentBase = $this->appendMediaLayerFilters(
                    $filters,
                    $layer,
                    $idx,
                    $stageIndex,
                    $currentBase,
                    $width,
                    $height
                );
                $stageIndex++;

                continue;
            }

            if ($type === 'shape') {
                $shapeBase = $this->appendShapeLayerFilters(
                    $filters,
                    $layer,
                    $stageIndex,
                    $currentBase,
                    $durationSec,
                    $fps,
                    $width,
                    $height
                );

                // A shape with neither fill nor border draws nothing, so it
                // must not burn a stage label either.
                if ($shapeBase !== null) {
                    $currentBase = $shapeBase;
                    $stageIndex++;
                }

                continue;
            }

            if ($type === 'text') {
                $filters[] = sprintf(
                    '%sdrawtext=%s[stage%d]',
                    $currentBase,
                    $this->buildTextLayerDrawtext($layer, $resolveFont),
                    $stageIndex
                );
                $currentBase = '[stage'.$stageIndex.']';
                $stageIndex++;
            }
        }

        return [
            'filters' => $filters,
            'inputs' => $inputs,
            'output' => $currentBase,
        ];
    }

    /**
     * Append the scale/trim/opacity/rotation chain plus the overlay for a
     * video or image layer. Returns the new base label.
     *
     * @param  array<int, string>  $filters
     * @param  array<string, mixed>  $layer
     */
    protected function appendMediaLayerFilters(
        array &$filters,
        array $layer,
        int $inputIdx,
        int $stageIndex,
        string $currentBase,
        int $projectWidth,
        int $projectHeight
    ): string {
        $x = (int) ($layer['x'] ?? 0);
        $y = (int) ($layer['y'] ?? 0);
        $width = (int) ($layer['width'] ?? $projectWidth);
        $height = (int) ($layer['height'] ?? $projectHeight);

        $chain = $this->buildMediaElementChain($layer, $width, $height, $x, $y);

        $layerLabel = '[layer'.$inputIdx.']';
        $overlayOutput = '[stage'.$stageIndex.']';

        $filters[] = sprintf('[%d:v]%s%s', $inputIdx, implode(',', $chain), $layerLabel);
        $filters[] = sprintf(
            '%s%soverlay=%d:%d:shortest=1%s',
            $currentBase,
            $layerLabel,
            $x,
            $y,
            $overlayOutput
        );

        return $overlayOutput;
    }

    /**
     * Build the per-input filter chain for a video or image element: trim,
     * speed, (optional) tail padding, scale, colour adjustments, opacity and
     * rotation. Shared by scene layers and overlay clips.
     *
     * $x/$y are shifted when the element is rotated so it stays centred.
     *
     * @param  array<string, mixed>  $element
     * @param  bool  $padTail  Hold the last frame so a short clip cannot end the overlay early.
     * @return array<int, string>
     */
    protected function buildMediaElementChain(
        array $element,
        int $width,
        int $height,
        int &$x,
        int &$y,
        bool $padTail = true
    ): array {
        $chain = [];

        if (($element['type'] ?? 'video') === 'video') {
            // Trim before anything else so the scale operates on the trimmed
            // segment and PTS start at zero.
            $trim = $this->buildTrimFilter($element['trim_start_ms'] ?? null, $element['trim_end_ms'] ?? null);
            if ($trim !== null) {
                $chain[] = $trim;
            }

            $speed = $this->normalizeSpeed($element['speed'] ?? null);
            if ($speed !== 1.0) {
                $chain[] = sprintf('setpts=PTS/%f', $speed);
            }

            // A scene layer is overlaid with shortest=1, so any clip that ends
            // before the scene does would truncate it. Hold the last frame
            // instead; the finite `color=` base still ends the overlay.
            if ($padTail) {
                $chain[] = 'tpad=stop=-1:stop_mode=clone';
            }

            $chain[] = sprintf('scale=%d:%d', $width, $height);
            $chain[] = 'setpts=PTS-STARTPTS';
        } else {
            $chain[] = sprintf('scale=%d:%d', $width, $height);
            $chain[] = 'loop=loop=-1:size=1:start=0';
            if (! $padTail) {
                $chain[] = 'setpts=PTS-STARTPTS';
            }
        }

        $eq = $this->buildEqFilter($element['adjustments'] ?? null);
        if ($eq !== null) {
            $chain[] = $eq;
        }

        $this->appendOpacityRotationFilters($chain, $element, $width, $height, $x, $y);

        return $chain;
    }

    /**
     * Append the shared opacity/rotation tail of a layer chain, shifting $x/$y
     * so a rotated layer stays centred on its original centre point.
     *
     * @param  array<int, string>  $chain
     * @param  array<string, mixed>  $layer
     * @param  bool  $alphaReady  True when the chain already produced an alpha format.
     */
    protected function appendOpacityRotationFilters(
        array &$chain,
        array $layer,
        int $width,
        int $height,
        int &$x,
        int &$y,
        bool $alphaReady = false
    ): void {
        $opacity = (float) ($layer['opacity'] ?? 1.0);
        $rotation = (float) ($layer['rotation'] ?? 0);
        $needsAlpha = $opacity < 1.0 || abs($rotation) > 0.0001;

        if ($needsAlpha && ! $alphaReady) {
            $chain[] = 'format=rgba';
        }

        if ($opacity < 1.0) {
            $chain[] = sprintf('colorchannelmixer=aa=%f', max($opacity, 0.0));
        }

        if (abs($rotation) > 0.0001) {
            $radians = deg2rad($rotation);
            $cos = abs(cos($radians));
            $sin = abs(sin($radians));
            $rotatedWidth = (int) round($width * $cos + $height * $sin);
            $rotatedHeight = (int) round($width * $sin + $height * $cos);

            $chain[] = sprintf(
                'rotate=a=%f:c=none:ow=%d:oh=%d',
                $radians,
                $rotatedWidth,
                $rotatedHeight
            );

            // Keep the layer centred on its original centre point.
            $x += (int) round(($width - $rotatedWidth) / 2);
            $y += (int) round(($height - $rotatedHeight) / 2);
        }
    }

    /**
     * Append a shape layer: a `color=` filter source (no input file) shaped by
     * `drawbox`/`geq`, then overlaid onto the current base.
     *
     * Returns the new base label, or null when the shape has neither a fill nor
     * a border and would render nothing.
     *
     * @param  array<int, string>  $filters
     * @param  array<string, mixed>  $layer
     */
    protected function appendShapeLayerFilters(
        array &$filters,
        array $layer,
        int $stageIndex,
        string $currentBase,
        float $durationSec,
        int $fps,
        int $projectWidth,
        int $projectHeight
    ): ?string {
        $x = (int) ($layer['x'] ?? 0);
        $y = (int) ($layer['y'] ?? 0);

        $chain = $this->buildShapeSourceChain($layer, $durationSec, $fps, $projectWidth, $projectHeight, $x, $y);
        if ($chain === null) {
            return null;
        }

        // Shapes consume no input file, so they get their own label namespace
        // keyed on the stage index (media layers use `[layer<inputIdx>]`).
        $shapeLabel = '[shape'.$stageIndex.']';
        $overlayOutput = '[stage'.$stageIndex.']';

        $filters[] = implode(',', $chain).$shapeLabel;
        $filters[] = sprintf(
            '%s%soverlay=%d:%d:shortest=1%s',
            $currentBase,
            $shapeLabel,
            $x,
            $y,
            $overlayOutput
        );

        return $overlayOutput;
    }

    /**
     * Build the filter chain that synthesises a shape (`rectangle`, `ellipse`
     * or `line`) from a `color=` source: fill, border ring, rounded corners,
     * opacity and rotation. Shared by scene layers and overlay clips.
     *
     * $x/$y are shifted when the shape is rotated so it stays centred. Returns
     * null when the shape has neither a fill nor a border and would render
     * nothing.
     *
     * @param  array<string, mixed>  $layer
     * @return array<int, string>|null
     */
    protected function buildShapeSourceChain(
        array $layer,
        float $durationSec,
        int $fps,
        int $projectWidth,
        int $projectHeight,
        int &$x,
        int &$y
    ): ?array {
        $width = max(1, (int) ($layer['width'] ?? $projectWidth));
        $height = max(1, (int) ($layer['height'] ?? $projectHeight));

        $shape = $layer['shape'] ?? 'rectangle';
        if (! in_array($shape, ['rectangle', 'ellipse', 'line'], true)) {
            $shape = 'rectangle';
        }

        $fill = $this->shapePaintColor($layer['fill_color'] ?? null);

        // Never let the border eat more than half of the shape.
        $borderWidth = (int) max(0, (float) ($layer['border_width'] ?? 0));
        $borderWidth = (int) min($borderWidth, floor(min($width, $height) / 2));
        $borderColor = $borderWidth > 0 ? $this->shapePaintColor($layer['border_color'] ?? null) : null;
        $hasBorder = $borderWidth > 0 && $borderColor !== null;

        if ($fill === null && ! $hasBorder) {
            return null;
        }

        // Ellipses are always masked; rectangles/lines only when rounded.
        $cornerRadius = $shape === 'ellipse'
            ? 0
            : (int) min(max(0, (float) ($layer['corner_radius'] ?? 0)), floor(min($width, $height) / 2));
        $needsMask = $shape === 'ellipse' || $cornerRadius > 0;

        $chain = [sprintf(
            'color=c=%s:s=%dx%d:d=%f:r=%d',
            $fill ?? 'black@0.0',
            $width,
            $height,
            $durationSec,
            $fps
        )];

        $alphaReady = $fill === null || $needsMask;
        if ($alphaReady) {
            $chain[] = 'format=rgba';
        }

        if ($needsMask) {
            $chain[] = $this->buildShapeMaskGeq(
                $shape,
                $cornerRadius,
                $fill !== null,
                $hasBorder ? $borderWidth : 0,
                $hasBorder ? (string) $borderColor : null
            );
        } elseif ($hasBorder) {
            // `replace=1` also writes the alpha channel, so the border stays
            // visible on an otherwise transparent source.
            $chain[] = sprintf(
                'drawbox=x=0:y=0:w=iw:h=ih:color=%s:t=%d:replace=1',
                $borderColor,
                $borderWidth
            );
        }

        $this->appendOpacityRotationFilters($chain, $layer, $width, $height, $x, $y, $alphaReady);

        return $chain;
    }

    /**
     * Normalise a shape colour, returning null for "no paint" (missing, empty,
     * `transparent` or `none`).
     */
    protected function shapePaintColor(mixed $color): ?string
    {
        if (! is_string($color)) {
            return null;
        }

        $color = trim($color);

        if ($color === '' || $color === 'transparent' || $color === 'none') {
            return null;
        }

        return $this->hexToFfmpegColor($color);
    }

    /**
     * Build the `geq` that carves a rounded rectangle or an ellipse out of the
     * `color` source, painting the border ring when one is set.
     *
     * The rectangle uses a rounded-rect signed distance field (negative inside);
     * the ellipse compares the normalised radius against 1 for the outer edge
     * and against an inset ellipse for the inner edge of the border.
     */
    protected function buildShapeMaskGeq(
        string $shape,
        int $cornerRadius,
        bool $hasFill,
        int $borderWidth,
        ?string $borderColor
    ): string {
        if ($shape === 'ellipse') {
            $outside = '(gt(pow(X-W/2,2)/pow(W/2,2)+pow(Y-H/2,2)/pow(H/2,2),1))';
            $inBorder = $borderWidth > 0
                ? sprintf(
                    '(gt(pow(X-W/2,2)/pow(W/2-%d,2)+pow(Y-H/2,2)/pow(H/2-%d,2),1))',
                    $borderWidth,
                    $borderWidth
                )
                : null;
        } else {
            // qx/qy are the distances outside the inner (un-rounded) box.
            $qx = sprintf('(abs(X-(W-1)/2)-(W/2-%d))', $cornerRadius);
            $qy = sprintf('(abs(Y-(H-1)/2)-(H/2-%d))', $cornerRadius);
            $distance = sprintf(
                '(hypot(max(%s,0),max(%s,0))+min(max(%s,%s),0)-%d)',
                $qx,
                $qy,
                $qx,
                $qy,
                $cornerRadius
            );

            $outside = sprintf('(gt(%s,0))', $distance);
            $inBorder = $borderWidth > 0
                ? sprintf('(gte(%s,-%d))', $distance, $borderWidth)
                : null;
        }

        $fillAlpha = $hasFill ? 255 : 0;
        $hasBorder = $inBorder !== null && $borderColor !== null;

        // geq refuses an alpha-only expression, so the colour planes are always
        // spelled out — passed through untouched when there is no border.
        $params = [];
        $borderRgb = $hasBorder ? $this->ffmpegColorToRgb((string) $borderColor) : null;

        foreach (['r', 'g', 'b'] as $index => $plane) {
            $params[] = $borderRgb === null
                ? sprintf("%s='%s(X,Y)'", $plane, $plane)
                : sprintf("%s='if(%s,%d,%s(X,Y))'", $plane, $inBorder, $borderRgb[$index], $plane);
        }

        $params[] = $hasBorder
            ? sprintf("a='if(%s,0,if(%s,255,%d))'", $outside, $inBorder, $fillAlpha)
            : sprintf("a='if(%s,0,%d)'", $outside, $fillAlpha);

        return 'geq='.implode(':', $params);
    }

    /**
     * Split an ffmpeg colour (`0xRRGGBB[AA]` or a named colour) into 0–255 RGB
     * components for use inside `geq` expressions. Unknown names fall back to
     * black, which is what ffmpeg itself does for an unparsable colour.
     *
     * @return array{0: int, 1: int, 2: int}
     */
    protected function ffmpegColorToRgb(string $color): array
    {
        $named = [
            'black' => '000000',
            'white' => 'ffffff',
            'red' => 'ff0000',
            'green' => '008000',
            'blue' => '0000ff',
            'yellow' => 'ffff00',
            'gray' => '808080',
            'grey' => '808080',
        ];

        $hex = str_starts_with($color, '0x')
            ? substr($color, 2)
            : ($named[strtolower($color)] ?? '000000');

        // Drop any alpha suffix and expand shorthand.
        $hex = substr($hex, 0, 6);
        if (strlen($hex) === 3) {
            $hex = $hex[0].$hex[0].$hex[1].$hex[1].$hex[2].$hex[2];
        }

        if (strlen($hex) !== 6 || ! ctype_xdigit($hex)) {
            $hex = '000000';
        }

        return [
            (int) hexdec(substr($hex, 0, 2)),
            (int) hexdec(substr($hex, 2, 2)),
            (int) hexdec(substr($hex, 4, 2)),
        ];
    }

    /**
     * Build a `trim=...,setpts=PTS-STARTPTS` fragment, or null when there is
     * nothing to trim.
     */
    protected function buildTrimFilter(mixed $trimStartMs, mixed $trimEndMs): ?string
    {
        $startMs = (int) ($trimStartMs ?? 0);
        $endMs = $trimEndMs === null ? null : (int) $trimEndMs;

        if ($startMs <= 0 && ($endMs === null || $endMs <= 0)) {
            return null;
        }

        $params = [];

        if ($startMs > 0) {
            $params[] = sprintf('start=%f', $startMs / 1000);
        }

        if ($endMs !== null && $endMs > 0 && $endMs > $startMs) {
            $params[] = sprintf('end=%f', $endMs / 1000);
        }

        if ($params === []) {
            return null;
        }

        return 'trim='.implode(':', $params).',setpts=PTS-STARTPTS';
    }

    /**
     * Audio counterpart of {@see buildTrimFilter}: selects the same source range
     * on the audio stream so a trimmed video layer's audio stays in sync.
     *
     * The bounds are source time, so this has to run *before* any `atempo`
     * retiming, exactly like `trim` runs before `setpts` on the video side.
     */
    protected function buildSourceAtrimFilter(mixed $trimStartMs, mixed $trimEndMs): ?string
    {
        $startMs = (int) ($trimStartMs ?? 0);
        $endMs = $trimEndMs === null ? null : (int) $trimEndMs;

        if ($startMs <= 0 && ($endMs === null || $endMs <= 0)) {
            return null;
        }

        $params = [];

        if ($startMs > 0) {
            $params[] = sprintf('start=%f', $startMs / 1000);
        }

        if ($endMs !== null && $endMs > 0 && $endMs > $startMs) {
            $params[] = sprintf('end=%f', $endMs / 1000);
        }

        if ($params === []) {
            return null;
        }

        return 'atrim='.implode(':', $params).',asetpts=PTS-STARTPTS';
    }

    /**
     * Clamp a layer volume into 0..1. Returns exactly 1.0 when the value is
     * missing or neutral so callers can cheaply skip the filter.
     */
    protected function normalizeVolume(mixed $volume): float
    {
        if (! is_numeric($volume)) {
            return 1.0;
        }

        $value = min(1.0, max(0.0, (float) $volume));

        return abs($value - 1.0) < 1e-6 ? 1.0 : $value;
    }

    /**
     * Clamp a playback speed into the supported range. Returns exactly 1.0 when
     * the value is missing or neutral so callers can cheaply skip the filters.
     */
    protected function normalizeSpeed(mixed $speed): float
    {
        if (! is_numeric($speed)) {
            return 1.0;
        }

        $value = min(self::MAX_SPEED, max(self::MIN_SPEED, (float) $speed));

        return abs($value - 1.0) < 1e-6 ? 1.0 : $value;
    }

    /**
     * `atempo` only accepts factors in [0.5, 2], so anything outside that range
     * is expressed as a chain of stages (4x becomes `atempo=2,atempo=2`).
     *
     * @return array<int, string>
     */
    protected function buildAtempoChain(float $speed): array
    {
        if (abs($speed - 1.0) < 1e-6) {
            return [];
        }

        $stages = [];
        $remaining = $speed;

        while ($remaining > 2.0 + 1e-6) {
            $stages[] = 2.0;
            $remaining /= 2.0;
        }

        while ($remaining < 0.5 - 1e-6) {
            $stages[] = 0.5;
            $remaining *= 2.0;
        }

        if (abs($remaining - 1.0) > 1e-6) {
            $stages[] = $remaining;
        }

        return array_map(fn (float $stage): string => sprintf('atempo=%f', $stage), $stages);
    }

    /**
     * Build an `eq=...` fragment for a layer's colour adjustments, or null when
     * every value is neutral.
     *
     * Stored values already use ffmpeg's own scales: brightness -1..1 (0
     * neutral), contrast 0..2 (1 neutral), saturation 0..2 (1 neutral).
     */
    protected function buildEqFilter(mixed $adjustments): ?string
    {
        if (! is_array($adjustments)) {
            return null;
        }

        $brightness = $this->clampAdjustment($adjustments['brightness'] ?? null, -1.0, 1.0, 0.0);
        $contrast = $this->clampAdjustment($adjustments['contrast'] ?? null, 0.0, 2.0, 1.0);
        $saturation = $this->clampAdjustment($adjustments['saturation'] ?? null, 0.0, 2.0, 1.0);

        $isNeutral = abs($brightness) < 1e-6
            && abs($contrast - 1.0) < 1e-6
            && abs($saturation - 1.0) < 1e-6;

        if ($isNeutral) {
            return null;
        }

        return sprintf(
            'eq=brightness=%f:contrast=%f:saturation=%f',
            $brightness,
            $contrast,
            $saturation
        );
    }

    protected function clampAdjustment(mixed $value, float $min, float $max, float $default): float
    {
        if (! is_numeric($value)) {
            return $default;
        }

        return min($max, max($min, (float) $value));
    }

    /**
     * Build the drawtext parameter string for a scene text layer.
     *
     * @param  array<string, mixed>  $layer
     * @param  (callable(string|null, string|null): (string|null))|null  $resolveFont
     */
    protected function buildTextLayerDrawtext(array $layer, ?callable $resolveFont = null): string
    {
        $resolveFont ??= $this->fontResolver();

        $layerX = (int) ($layer['x'] ?? 0);
        $layerY = (int) ($layer['y'] ?? 0);
        $layerWidth = (int) ($layer['width'] ?? 100);
        $layerHeight = (int) ($layer['height'] ?? 50);
        $fontSize = (int) ($layer['font_size'] ?? 48);
        $fontColor = $this->hexToFfmpegColor($layer['font_color'] ?? 'white');
        $strokeWidth = (int) ($layer['stroke_width'] ?? 0);
        $strokeColor = $this->hexToFfmpegColor($layer['stroke_color'] ?? 'black');
        $padding = (int) ($layer['padding'] ?? 0);
        $opacity = (float) ($layer['opacity'] ?? 1.0);

        $params = [];

        $fontFile = $resolveFont($layer['font_family'] ?? null, $layer['font_weight'] ?? null);
        if ($fontFile !== null) {
            $params[] = sprintf("fontfile='%s'", $this->escapeFilterPath($fontFile));
        }

        $params[] = sprintf("text='%s'", $this->escapeDrawtext((string) ($layer['text'] ?? '')));
        $params[] = 'fontsize='.$fontSize;
        $params[] = 'fontcolor='.$fontColor;
        $params[] = 'x='.$this->textAlignXExpression(
            $layer['text_align'] ?? 'center',
            $layerX,
            $layerWidth,
            $padding
        );
        $params[] = sprintf('y=(%d-text_h/2)', (int) ($layerY + $layerHeight / 2));

        $backgroundColor = $layer['background_color'] ?? null;
        if (is_string($backgroundColor) && $backgroundColor !== '' && $backgroundColor !== 'transparent') {
            $params[] = 'box=1';
            $params[] = 'boxcolor='.$this->hexToFfmpegColor($backgroundColor);
            $params[] = 'boxborderw='.$padding;
        }

        if ($strokeWidth > 0) {
            $params[] = 'borderw='.$strokeWidth;
            $params[] = 'bordercolor='.$strokeColor;
        }

        if ($opacity < 1.0) {
            $params[] = sprintf('alpha=%f', max($opacity, 0.0));
        }

        return implode(':', $params);
    }

    /**
     * Horizontal drawtext expression honouring the layer's text alignment.
     */
    protected function textAlignXExpression(mixed $align, int $layerX, int $layerWidth, int $padding): string
    {
        return match ($align) {
            'left' => sprintf('(%d)', $layerX + $padding),
            'right' => sprintf('(%d-text_w)', $layerX + $layerWidth - $padding),
            default => sprintf('(%d-text_w/2)', (int) ($layerX + $layerWidth / 2)),
        };
    }

    /**
     * Scene background colour in an ffmpeg-compatible form.
     *
     * @param  array<string, mixed>  $scene
     */
    protected function sceneBackgroundColor(array $scene): string
    {
        $color = $scene['background_color'] ?? null;

        if (! is_string($color) || trim($color) === '' || $color === 'transparent') {
            return 'black';
        }

        return $this->hexToFfmpegColor(trim($color));
    }

    /**
     * Default asset resolver: looks the asset up and returns its local path.
     *
     * @return callable(mixed): (array{path: string, duration_ms: int|null}|null)
     */
    protected function assetResolver(): callable
    {
        return function (mixed $assetId): ?array {
            $asset = Asset::find($assetId);

            if (! $asset) {
                return null;
            }

            return [
                'path' => $asset->getLocalPath(),
                'duration_ms' => $asset->duration_ms,
            ];
        };
    }

    /**
     * Default font resolver: maps a CSS-ish font family + weight onto a font
     * file present on this machine, or null when nothing matches.
     *
     * @return callable(string|null, string|null): (string|null)
     */
    protected function fontResolver(): callable
    {
        return fn (?string $family, ?string $weight): ?string => $this->findFontFile($family, $weight);
    }

    /**
     * Resolve a font file for the given family/weight from a small curated map
     * of fonts commonly available on macOS and Linux.
     */
    protected function findFontFile(?string $family, ?string $weight): ?string
    {
        $bold = is_string($weight) && strtolower($weight) === 'bold';

        // Take the first family of a CSS-style stack, strip quotes.
        $key = strtolower(trim(explode(',', (string) $family)[0], " \t\"'"));

        /** @var array<string, array{regular: array<int, string>, bold: array<int, string>}> $map */
        $map = [
            'arial' => [
                'regular' => ['Arial.ttf', 'LiberationSans-Regular.ttf', 'DejaVuSans.ttf'],
                'bold' => ['Arial Bold.ttf', 'Arial-Bold.ttf', 'LiberationSans-Bold.ttf', 'DejaVuSans-Bold.ttf'],
            ],
            'helvetica' => [
                'regular' => ['Helvetica.ttc', 'Arial.ttf', 'LiberationSans-Regular.ttf', 'DejaVuSans.ttf'],
                'bold' => ['Helvetica.ttc', 'Arial Bold.ttf', 'LiberationSans-Bold.ttf', 'DejaVuSans-Bold.ttf'],
            ],
            'georgia' => [
                'regular' => ['Georgia.ttf', 'LiberationSerif-Regular.ttf', 'DejaVuSerif.ttf'],
                'bold' => ['Georgia Bold.ttf', 'LiberationSerif-Bold.ttf', 'DejaVuSerif-Bold.ttf'],
            ],
            'times new roman' => [
                'regular' => ['Times New Roman.ttf', 'LiberationSerif-Regular.ttf', 'DejaVuSerif.ttf'],
                'bold' => ['Times New Roman Bold.ttf', 'LiberationSerif-Bold.ttf', 'DejaVuSerif-Bold.ttf'],
            ],
            'courier new' => [
                'regular' => ['Courier New.ttf', 'LiberationMono-Regular.ttf', 'DejaVuSansMono.ttf'],
                'bold' => ['Courier New Bold.ttf', 'LiberationMono-Bold.ttf', 'DejaVuSansMono-Bold.ttf'],
            ],
            'impact' => [
                'regular' => ['Impact.ttf', 'DejaVuSans-Bold.ttf'],
                'bold' => ['Impact.ttf', 'DejaVuSans-Bold.ttf'],
            ],
            'verdana' => [
                'regular' => ['Verdana.ttf', 'DejaVuSans.ttf'],
                'bold' => ['Verdana Bold.ttf', 'DejaVuSans-Bold.ttf'],
            ],
        ];

        $default = [
            'regular' => ['Helvetica.ttc', 'Arial.ttf', 'DejaVuSans.ttf', 'LiberationSans-Regular.ttf'],
            'bold' => ['Arial Bold.ttf', 'DejaVuSans-Bold.ttf', 'LiberationSans-Bold.ttf', 'Helvetica.ttc'],
        ];

        $candidates = $map[$key] ?? $default;
        $filenames = $bold ? $candidates['bold'] : $candidates['regular'];

        // Nothing to do when the family is unset and the weight is normal:
        // let ffmpeg pick its own default font.
        if ($key === '' && ! $bold) {
            return null;
        }

        foreach ($filenames as $filename) {
            foreach ($this->fontSearchPaths() as $directory) {
                $path = $directory.'/'.$filename;

                if (is_file($path)) {
                    return $path;
                }
            }
        }

        return null;
    }

    /**
     * @return array<int, string>
     */
    protected function fontSearchPaths(): array
    {
        return [
            '/System/Library/Fonts/Supplemental',
            '/System/Library/Fonts',
            '/Library/Fonts',
            '/usr/share/fonts/truetype/dejavu',
            '/usr/share/fonts/truetype/liberation',
            '/usr/share/fonts/truetype/msttcorefonts',
            '/usr/share/fonts/TTF',
            '/usr/share/fonts',
            '/usr/local/share/fonts',
        ];
    }

    /**
     * Concatenate multiple videos into one.
     *
     * When any scene declares a transition the videos are joined with a chain
     * of `xfade` filters (which requires a re-encode); otherwise the fast
     * stream-copy concat demuxer is used.
     *
     * @param  array<string>  $videoPaths
     * @param  array<int, array<string, mixed>>  $scenes  Scenes matching $videoPaths, used for transitions
     */
    public function concatenateVideos(array $videoPaths, array $scenes = [], int $fps = 30): string
    {
        if (count($videoPaths) === 1) {
            return $videoPaths[0];
        }

        if (count($scenes) === count($videoPaths) && $this->resolveTransitions($scenes, $fps) !== []) {
            return $this->concatenateVideosWithTransitions($videoPaths, $scenes, $fps);
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
     * Join the scene videos with an xfade chain (re-encode path).
     *
     * @param  array<string>  $videoPaths
     * @param  array<int, array<string, mixed>>  $scenes
     */
    protected function concatenateVideosWithTransitions(array $videoPaths, array $scenes, int $fps): string
    {
        $outputPath = $this->getTempPath('xfade_'.Str::uuid().'.mp4');

        $graph = $this->buildTransitionFilterGraph($scenes, $fps);

        $command = ['ffmpeg', '-y'];

        foreach ($videoPaths as $path) {
            $command[] = '-i';
            $command[] = $path;
        }

        $command[] = '-filter_complex';
        $command[] = implode(';', $graph['filters']);
        $command[] = '-map';
        $command[] = $graph['output'];
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
        $command[] = '-r';
        $command[] = (string) $fps;
        $command[] = '-movflags';
        $command[] = '+faststart';
        $command[] = '-t';
        $command[] = $this->formatSeconds($graph['totalDurationMs']);
        $command[] = $outputPath;

        $result = Process::timeout(900)->run($command);

        if (! $result->successful()) {
            throw new \RuntimeException('Video transition render failed: '.$result->errorOutput());
        }

        return $outputPath;
    }

    /**
     * Build the xfade chain joining every scene video.
     *
     * Input `i` is the rendered video of scene `i`. Each transition shortens the
     * output by its own duration, so the offset of junction `i` is the output
     * duration accumulated so far minus that transition's duration.
     *
     * When at least one scene declares a transition the whole timeline goes
     * through a single xfade chain; junctions without a declared transition get
     * a one-frame `fade`, which is visually a hard cut (see resolveTransitions).
     *
     * @param  array<int, array<string, mixed>>  $scenes
     * @return array{filters: array<int, string>, output: string, totalDurationMs: int}
     */
    public function buildTransitionFilterGraph(array $scenes, int $fps = 30): array
    {
        $scenes = array_values($scenes);
        $transitions = $this->resolveTransitions($scenes, $fps);

        if ($transitions === []) {
            return [
                'filters' => [],
                'output' => '[0:v]',
                'totalDurationMs' => $this->sumSceneDurations($scenes),
            ];
        }

        $filters = [];

        // Normalise every input so xfade sees identical timebases and formats.
        foreach ($scenes as $index => $scene) {
            $filters[] = sprintf('[%d:v]settb=AVTB,setpts=PTS-STARTPTS,format=yuv420p[xv%d]', $index, $index);
        }

        $current = '[xv0]';
        $accumulatedMs = $this->sceneDurationMs($scenes[0]);

        foreach ($transitions as $index => $transition) {
            $label = '[xf'.($index + 1).']';

            $filters[] = sprintf(
                '%s[xv%d]xfade=transition=%s:duration=%s:offset=%s%s',
                $current,
                $index + 1,
                $transition['type'],
                $this->formatSeconds($transition['duration_ms']),
                $this->formatSeconds($accumulatedMs - $transition['duration_ms']),
                $label
            );

            $current = $label;
            $accumulatedMs += $this->sceneDurationMs($scenes[$index + 1]) - $transition['duration_ms'];
        }

        return [
            'filters' => $filters,
            'output' => $current,
            'totalDurationMs' => $accumulatedMs,
        ];
    }

    /**
     * Resolve the effective transition for every scene junction.
     *
     * Returns an empty array when no scene declares a transition (the caller
     * then keeps the fast concat path). Otherwise every junction gets an entry:
     * declared ones use their (clamped) duration, undeclared ones a one-frame
     * `fade` so the whole timeline can go through a single xfade chain.
     *
     * The duration is clamped to at most 1500ms and at most half of either
     * adjacent scene's duration. Unknown types fall back to `fade`. A
     * transition on the last scene is ignored.
     *
     * @param  array<int, array<string, mixed>>  $scenes
     * @return array<int, array{type: string, duration_ms: int, declared: bool}>
     */
    public function resolveTransitions(array $scenes, int $fps = 30): array
    {
        $scenes = array_values($scenes);
        $count = count($scenes);

        if ($count < 2) {
            return [];
        }

        $declaredAny = false;
        for ($index = 0; $index < $count - 1; $index++) {
            if (is_array($scenes[$index]['transition'] ?? null)) {
                $declaredAny = true;
                break;
            }
        }

        if (! $declaredAny) {
            return [];
        }

        $frameMs = max(1, (int) round(1000 / max(1, $fps)));
        $transitions = [];

        for ($index = 0; $index < $count - 1; $index++) {
            $declared = is_array($scenes[$index]['transition'] ?? null)
                ? $scenes[$index]['transition']
                : null;

            $requestedMs = $declared === null
                ? $frameMs
                : (int) round((float) ($declared['duration_ms'] ?? self::DEFAULT_TRANSITION_MS));

            $maxMs = min(
                self::MAX_TRANSITION_MS,
                intdiv($this->sceneDurationMs($scenes[$index]), 2),
                intdiv($this->sceneDurationMs($scenes[$index + 1]), 2),
            );

            $transitions[$index] = [
                'type' => $declared === null
                    ? TransitionType::Fade->value
                    : TransitionType::fromNameOrFade($declared['type'] ?? null)->value,
                'duration_ms' => max(1, min($requestedMs, $maxMs)),
                'declared' => $declared !== null,
            ];
        }

        return $transitions;
    }

    /**
     * Duration of the rendered output once transitions have overlapped scenes.
     *
     * @param  array<int, array<string, mixed>>  $scenes
     */
    public function totalOutputDurationMs(array $scenes, int $fps = 30): int
    {
        $total = $this->sumSceneDurations($scenes);

        foreach ($this->resolveTransitions($scenes, $fps) as $transition) {
            $total -= $transition['duration_ms'];
        }

        return max(0, $total);
    }

    /**
     * Start time of each scene in the rendered output.
     *
     * @param  array<int, array<string, mixed>>  $scenes
     * @return array<int, int>
     */
    public function sceneOutputStartTimes(array $scenes, int $fps = 30): array
    {
        $transitions = $this->resolveTransitions($scenes, $fps);

        $starts = [];
        $originalMs = 0;
        $shiftMs = 0;

        foreach (array_values($scenes) as $index => $scene) {
            if ($index > 0) {
                $shiftMs += $transitions[$index - 1]['duration_ms'] ?? 0;
            }

            $starts[$index] = max(0, $originalMs - $shiftMs);
            $originalMs += $this->sceneDurationMs($scene);
        }

        return $starts;
    }

    /**
     * Map a time on the original (un-transitioned) timeline to output time.
     *
     * Transitions overlap video only: everything positioned on the absolute
     * timeline (audio clips, overlay clips, subtitles) shifts earlier by the
     * transition durations accumulated before the scene it falls in.
     *
     * @param  array<int, array<string, mixed>>  $scenes
     */
    public function mapTimelineMs(array $scenes, float $ms, int $fps = 30): int
    {
        $transitions = $this->resolveTransitions($scenes, $fps);

        if ($transitions === []) {
            return (int) round($ms);
        }

        $originalMs = 0;
        $shiftMs = 0;

        foreach (array_values($scenes) as $index => $scene) {
            if ($index > 0) {
                $shiftMs += $transitions[$index - 1]['duration_ms'] ?? 0;
            }

            $originalMs += $this->sceneDurationMs($scene);

            if ($ms < $originalMs) {
                break;
            }
        }

        return (int) max(0, round($ms - $shiftMs));
    }

    /**
     * Shift every subtitle entry (and word) onto the transition-aware timeline.
     *
     * @param  array<int, array<string, mixed>>  $subtitleTracks
     * @param  array<int, array<string, mixed>>  $scenes
     * @return array<int, array<string, mixed>>
     */
    public function shiftSubtitleTracks(array $subtitleTracks, array $scenes, int $fps = 30): array
    {
        if ($this->resolveTransitions($scenes, $fps) === []) {
            return $subtitleTracks;
        }

        foreach ($subtitleTracks as $trackIndex => $track) {
            foreach ($track['entries'] ?? [] as $entryIndex => $entry) {
                $subtitleTracks[$trackIndex]['entries'][$entryIndex]['start_ms'] = $this->mapTimelineMs($scenes, (float) ($entry['start_ms'] ?? 0), $fps);
                $subtitleTracks[$trackIndex]['entries'][$entryIndex]['end_ms'] = $this->mapTimelineMs($scenes, (float) ($entry['end_ms'] ?? 0), $fps);

                foreach ($entry['words'] ?? [] as $wordIndex => $word) {
                    $subtitleTracks[$trackIndex]['entries'][$entryIndex]['words'][$wordIndex]['start_ms'] = $this->mapTimelineMs($scenes, (float) ($word['start_ms'] ?? 0), $fps);
                    $subtitleTracks[$trackIndex]['entries'][$entryIndex]['words'][$wordIndex]['end_ms'] = $this->mapTimelineMs($scenes, (float) ($word['end_ms'] ?? 0), $fps);
                }
            }
        }

        return $subtitleTracks;
    }

    /**
     * @param  array<int, array<string, mixed>>  $scenes
     */
    protected function sumSceneDurations(array $scenes): int
    {
        $total = 0;

        foreach ($scenes as $scene) {
            $total += $this->sceneDurationMs($scene);
        }

        return $total;
    }

    /**
     * @param  array<string, mixed>  $scene
     */
    protected function sceneDurationMs(array $scene): int
    {
        return (int) ($scene['duration_ms'] ?? 5000);
    }

    /**
     * Format milliseconds as an ffmpeg seconds value.
     */
    protected function formatSeconds(int|float $ms): string
    {
        return sprintf('%.3f', $ms / 1000);
    }

    /**
     * Mix multiple audio tracks together.
     *
     * @param  array<array<string, mixed>>  $audioTracks
     * @param  array<int, array<string, mixed>>  $scenes  Used to map clip start times onto the transition-aware timeline
     */
    public function mixAudioTracks(array $audioTracks, int $totalDurationMs, array $scenes = [], int $fps = 30): string
    {
        $outputPath = $this->getTempPath('audio_mix_'.Str::uuid().'.mp3');
        $durationSec = $totalDurationMs / 1000;

        $graph = $this->buildAudioMixFilter($audioTracks, null, $scenes, $fps);

        if ($graph['output'] === null) {
            return $this->createSilentAudio($durationSec, $outputPath);
        }

        $command = ['ffmpeg', '-y'];

        foreach ($graph['inputs'] as $input) {
            $command[] = '-i';
            $command[] = $input;
        }

        $command[] = '-filter_complex';
        $command[] = implode(';', $graph['filters']);
        $command[] = '-map';
        $command[] = $graph['output'];
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
     * Build the filtergraph mixing every audio clip of every (unmuted) track.
     *
     * Muted tracks are skipped entirely; each clip is trimmed, PTS-reset, faded
     * in/out, delayed to its timeline position and volume-scaled.
     *
     * Clip start times are mapped onto the transition-aware output timeline.
     *
     * @param  array<array<string, mixed>>  $audioTracks
     * @param  (callable(mixed): (array{path: string, duration_ms?: int|null}|null))|null  $resolveAsset
     * @param  array<int, array<string, mixed>>  $scenes
     * @return array{filters: array<int, string>, inputs: array<int, string>, output: string|null}
     */
    public function buildAudioMixFilter(
        array $audioTracks,
        ?callable $resolveAsset = null,
        array $scenes = [],
        int $fps = 30
    ): array {
        $resolveAsset ??= $this->assetResolver();

        $inputs = [];
        $filters = [];
        $mixInputs = [];
        $inputIndex = 0;

        foreach ($audioTracks as $track) {
            if ($track['muted'] ?? false) {
                continue;
            }

            $trackVolume = (float) ($track['volume'] ?? 1.0);

            foreach ($track['clips'] ?? [] as $clip) {
                $assetId = $clip['asset_id'] ?? null;
                if (! $assetId) {
                    continue;
                }

                $asset = $resolveAsset($assetId);
                if ($asset === null) {
                    continue;
                }

                $inputs[] = $asset['path'];

                $delayMs = $this->mapTimelineMs($scenes, (float) ($clip['start_ms'] ?? 0), $fps);
                $clipDurationMs = (int) ($clip['duration_ms'] ?? ($asset['duration_ms'] ?? 10000));
                $trimStartMs = (int) ($clip['trim_start_ms'] ?? 0);
                $volume = (float) ($clip['volume'] ?? 1.0) * $trackVolume;
                $outputLabel = '[a'.$inputIndex.']';

                $chain = [
                    sprintf('atrim=start=%f:duration=%f', $trimStartMs / 1000, $clipDurationMs / 1000),
                    // Reset PTS so the fade/delay offsets below are relative to
                    // the start of the clip rather than to the source file.
                    'asetpts=PTS-STARTPTS',
                ];

                foreach ($this->buildFadeFilters($clip, $clipDurationMs) as $fade) {
                    $chain[] = $fade;
                }

                $chain[] = sprintf('adelay=%d|%d', $delayMs, $delayMs);
                $chain[] = sprintf('volume=%f', $volume);

                $filters[] = sprintf('[%d:a]%s%s', $inputIndex, implode(',', $chain), $outputLabel);
                $mixInputs[] = $outputLabel;
                $inputIndex++;
            }
        }

        if ($mixInputs === []) {
            return ['filters' => [], 'inputs' => [], 'output' => null];
        }

        $filters[] = implode('', $mixInputs).'amix=inputs='.count($mixInputs).':duration=longest[aout]';

        return ['filters' => $filters, 'inputs' => $inputs, 'output' => '[aout]'];
    }

    /**
     * Build the afade fragments for an audio clip.
     *
     * @param  array<string, mixed>  $clip
     * @return array<int, string>
     */
    protected function buildFadeFilters(array $clip, int $clipDurationMs): array
    {
        $fades = [];

        $fadeInMs = (int) ($clip['fade_in_ms'] ?? 0);
        $fadeOutMs = (int) ($clip['fade_out_ms'] ?? 0);

        if ($fadeInMs > 0) {
            $fades[] = sprintf('afade=t=in:st=0:d=%f', min($fadeInMs, $clipDurationMs) / 1000);
        }

        if ($fadeOutMs > 0 && $clipDurationMs > 0) {
            $fadeOutMs = min($fadeOutMs, $clipDurationMs);
            $fades[] = sprintf(
                'afade=t=out:st=%f:d=%f',
                ($clipDurationMs - $fadeOutMs) / 1000,
                $fadeOutMs / 1000
            );
        }

        return $fades;
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
        string $outputPath,
        string $color = 'black'
    ): string {
        $result = Process::timeout(60)->run([
            'ffmpeg', '-y',
            '-f', 'lavfi',
            '-i', sprintf('color=c=%s:s=%dx%d:d=%f:r=%d', $color, $width, $height, $durationSec, $fps),
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

        $graph = $this->buildOverlayFilterGraph(
            $videoTracks,
            null,
            null,
            $project->scenes ?? [],
            $project->fps,
        );

        // If no overlays were added, just return the input
        if ($graph['filters'] === []) {
            return $inputPath;
        }

        $command = ['ffmpeg', '-y'];

        foreach (array_merge([$inputPath], $graph['inputs']) as $input) {
            $command[] = '-i';
            $command[] = $input;
        }

        $command[] = '-filter_complex';
        $command[] = implode(';', $graph['filters']);
        $command[] = '-map';
        $command[] = $graph['output'];
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
     * Build the filtergraph overlaying video/image/text/shape clips onto input `[0:v]`.
     *
     * The returned inputs are the extra ffmpeg inputs (input 0 is the base
     * video and is not included).
     *
     * Clip enable windows are mapped onto the transition-aware output timeline.
     *
     * @param  array<array<string, mixed>>  $videoTracks
     * @param  (callable(mixed): (array{path: string, duration_ms?: int|null}|null))|null  $resolveAsset
     * @param  (callable(string|null, string|null): (string|null))|null  $resolveFont
     * @param  array<int, array<string, mixed>>  $scenes
     * @return array{filters: array<int, string>, inputs: array<int, string>, output: string}
     */
    public function buildOverlayFilterGraph(
        array $videoTracks,
        ?callable $resolveAsset = null,
        ?callable $resolveFont = null,
        array $scenes = [],
        int $fps = 30
    ): array {
        $resolveAsset ??= $this->assetResolver();
        $resolveFont ??= $this->fontResolver();

        $inputs = [];
        $filters = [];
        $currentBase = '[0:v]';
        $inputIndex = 1;
        $overlayIndex = 1;

        foreach ($videoTracks as $track) {
            if (! ($track['visible'] ?? true)) {
                continue;
            }

            foreach ($track['clips'] ?? [] as $clip) {
                $clipStartMs = (float) ($clip['start_ms'] ?? 0);
                $startSec = $this->mapTimelineMs($scenes, $clipStartMs, $fps) / 1000;
                $endSec = $this->mapTimelineMs($scenes, $clipStartMs + ($clip['duration_ms'] ?? 5000), $fps) / 1000;
                $x = (int) ($clip['x'] ?? 0);
                $y = (int) ($clip['y'] ?? 0);
                $width = (int) ($clip['width'] ?? 320);
                $height = (int) ($clip['height'] ?? 180);
                $overlayOutput = '[out'.$overlayIndex.']';
                $clipType = $clip['type'] ?? 'video';

                if ($clipType === 'text') {
                    // Same drawtext as a scene text layer; overlays default to
                    // a padded translucent box so legacy clips keep their look.
                    $filters[] = sprintf(
                        "%sdrawtext=%s:enable='between(t,%f,%f)'%s",
                        $currentBase,
                        $this->buildTextLayerDrawtext(
                            $clip + ['padding' => 12, 'background_color' => '#00000080'],
                            $resolveFont
                        ),
                        $startSec,
                        $endSec,
                        $overlayOutput
                    );

                    $currentBase = $overlayOutput;
                    $overlayIndex++;

                    continue;
                }

                if ($clipType === 'shape') {
                    // Shapes need no input file: a `color=` source running to
                    // the clip's end, gated by the same enable window. Opacity
                    // and rotation are applied inside the shape chain.
                    $chain = $this->buildShapeSourceChain($clip, $endSec, $fps, $width, $height, $x, $y);

                    // A shape with neither fill nor border draws nothing.
                    if ($chain === null) {
                        continue;
                    }

                    $shapeLabel = '[shape'.$overlayIndex.']';
                    $filters[] = implode(',', $chain).$shapeLabel;
                    $filters[] = sprintf(
                        "%s%soverlay=%d:%d:enable='between(t,%f,%f)'%s",
                        $currentBase,
                        $shapeLabel,
                        $x,
                        $y,
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

                $asset = $resolveAsset($assetId);
                if ($asset === null) {
                    continue;
                }

                $inputs[] = $asset['path'];

                // Same chain as a scene media layer minus the tail padding: the
                // enable window bounds the clip, so nothing needs holding.
                $chain = $this->buildMediaElementChain($clip, $width, $height, $x, $y, padTail: false);

                $scaledLabel = '[scaled'.$inputIndex.']';
                $filters[] = sprintf('[%d:v]%s%s', $inputIndex, implode(',', $chain), $scaledLabel);

                $filters[] = sprintf(
                    "%s%soverlay=%d:%d:enable='between(t,%f,%f)'%s",
                    $currentBase,
                    $scaledLabel,
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

        return ['filters' => $filters, 'inputs' => $inputs, 'output' => $currentBase];
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
            $this->shiftSubtitleTracks($subtitleTracks, $project->scenes ?? [], $project->fps),
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
        return $this->escapeFilterPath($path);
    }

    /**
     * Escape a file path for use inside an ffmpeg filtergraph value.
     */
    protected function escapeFilterPath(string $path): string
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
     * - Single quotes (') delimit text values. Inside a quoted value a
     *   backslash is NOT an escape character, so a literal quote has to close
     *   the quoted section, escape the quote, and reopen it: '\''
     * - Percent signs (%) are used for text expansion
     */
    protected function escapeDrawtext(string $text): string
    {
        return str_replace(
            ['\\', ':', "'", '%'],
            ['\\\\', '\\:', "'\\''", '%%'],
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
     * Build the filtergraph extracting and positioning every scene's video audio.
     *
     * Each scene's audio is trimmed to the scene duration and delayed to the
     * scene's start time *on the output timeline* (i.e. shifted earlier by the
     * transition durations accumulated before it). Because transitions overlap
     * the video, the two neighbouring scene audios overlap during a transition;
     * an afade out/in pair on each side turns that overlap into an actual
     * crossfade once the streams are amix-ed.
     *
     * @param  array<array<string, mixed>>  $scenes
     * @param  (callable(mixed): (array{path: string, duration_ms?: int|null}|null))|null  $resolveAsset
     * @return array{filters: array<int, string>, inputs: array<int, string>, output: string|null}
     */
    public function buildSceneAudioFilter(array $scenes, int $fps = 30, ?callable $resolveAsset = null): array
    {
        $resolveAsset ??= $this->assetResolver();

        $scenes = array_values($scenes);
        $transitions = $this->resolveTransitions($scenes, $fps);
        $startTimes = $this->sceneOutputStartTimes($scenes, $fps);

        $inputs = [];
        $filters = [];
        $mixInputs = [];
        $inputIndex = 0;

        foreach ($scenes as $sceneIndex => $scene) {
            $sceneDurationMs = $this->sceneDurationMs($scene);
            $startMs = $startTimes[$sceneIndex] ?? 0;
            $fadeInMs = $transitions[$sceneIndex - 1]['duration_ms'] ?? 0;
            $fadeOutMs = $transitions[$sceneIndex]['duration_ms'] ?? 0;

            foreach ($scene['layers'] ?? [] as $layer) {
                if (($layer['type'] ?? null) !== 'video' || empty($layer['asset_id'])) {
                    continue;
                }

                if (($layer['muted'] ?? false) === true) {
                    continue;
                }

                $asset = $resolveAsset($layer['asset_id']);
                if ($asset === null) {
                    continue;
                }

                $inputs[] = $asset['path'];
                $outputLabel = '[a'.$inputIndex.']';

                $chain = [];

                // Select the same source range the video layer uses, on source
                // time, before any retiming.
                $sourceTrim = $this->buildSourceAtrimFilter(
                    $layer['trim_start_ms'] ?? null,
                    $layer['trim_end_ms'] ?? null
                );
                if ($sourceTrim !== null) {
                    $chain[] = $sourceTrim;
                }

                // Retime after trimming so the sped-up audio still fills the
                // whole scene and stays in sync with the video layer.
                $chain = array_merge($chain, $this->buildAtempoChain($this->normalizeSpeed($layer['speed'] ?? null)));

                $chain[] = sprintf('atrim=0:%f', $sceneDurationMs / 1000);
                // Reset PTS so the fades and the delay below are relative to
                // the start of the scene, not the source file.
                $chain[] = 'asetpts=PTS-STARTPTS';

                if ($fadeInMs > 0) {
                    $chain[] = sprintf('afade=t=in:st=0:d=%f', $fadeInMs / 1000);
                }

                if ($fadeOutMs > 0 && $sceneDurationMs > 0) {
                    $chain[] = sprintf(
                        'afade=t=out:st=%f:d=%f',
                        ($sceneDurationMs - $fadeOutMs) / 1000,
                        $fadeOutMs / 1000
                    );
                }

                $chain[] = sprintf('adelay=%d|%d', $startMs, $startMs);

                $volume = $this->normalizeVolume($layer['volume'] ?? null);
                if ($volume !== 1.0) {
                    $chain[] = sprintf('volume=%f', $volume);
                }

                $filters[] = sprintf('[%d:a]%s%s', $inputIndex, implode(',', $chain), $outputLabel);
                $mixInputs[] = $outputLabel;
                $inputIndex++;
            }
        }

        if ($mixInputs === []) {
            return ['filters' => [], 'inputs' => [], 'output' => null];
        }

        $filters[] = count($mixInputs) === 1
            ? $mixInputs[0].'anull[aout]'
            : implode('', $mixInputs).'amix=inputs='.count($mixInputs).':duration=longest[aout]';

        return ['filters' => $filters, 'inputs' => $inputs, 'output' => '[aout]'];
    }

    /**
     * Extract audio from video layers in scenes.
     *
     * @param  array<array<string, mixed>>  $scenes
     */
    public function extractSceneAudio(array $scenes, int $fps = 30): ?string
    {
        $graph = $this->buildSceneAudioFilter($scenes, $fps);

        if ($graph['output'] === null) {
            return null;
        }

        $outputPath = $this->getTempPath('scene_audio_'.Str::uuid().'.mp3');

        $command = ['ffmpeg', '-y'];

        foreach ($graph['inputs'] as $input) {
            $command[] = '-i';
            $command[] = $input;
        }

        $command[] = '-filter_complex';
        $command[] = implode(';', $graph['filters']);
        $command[] = '-map';
        $command[] = $graph['output'];
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
