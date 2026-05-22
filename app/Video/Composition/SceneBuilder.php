<?php

namespace App\Video\Composition;

use App\Models\Asset;
use App\Models\Project;
use Illuminate\Support\Str;

class SceneBuilder
{
    /**
     * @param  array<string, mixed>  $scene
     */
    public function __construct(
        protected Project $project,
        protected array &$scene,
    ) {}

    public function duration(int $durationMs): self
    {
        $this->scene['duration_ms'] = $durationMs;

        return $this;
    }

    public function background(string $color): self
    {
        $this->scene['background_color'] = $color;

        return $this;
    }

    public function text(string $text): LayerBuilder
    {
        return $this->addLayer([
            'id' => (string) Str::uuid(),
            'type' => 'text',
            'text' => $text,
            'x' => 0,
            'y' => 0,
            'width' => $this->project->resolution_width,
            'height' => 180,
            'z_index' => count($this->scene['layers'] ?? []),
            'font_size' => 48,
            'font_color' => '#ffffff',
        ]);
    }

    public function image(Asset|int $asset): LayerBuilder
    {
        return $this->assetLayer('image', $asset);
    }

    public function video(Asset|int $asset): LayerBuilder
    {
        return $this->assetLayer('video', $asset);
    }

    protected function assetLayer(string $type, Asset|int $asset): LayerBuilder
    {
        return $this->addLayer([
            'id' => (string) Str::uuid(),
            'type' => $type,
            'asset_id' => $asset instanceof Asset ? $asset->id : $asset,
            'x' => 0,
            'y' => 0,
            'width' => $this->project->resolution_width,
            'height' => $this->project->resolution_height,
            'z_index' => count($this->scene['layers'] ?? []),
        ]);
    }

    /**
     * @param  array<string, mixed>  $layer
     */
    protected function addLayer(array $layer): LayerBuilder
    {
        $this->scene['layers'] ??= [];
        $this->scene['layers'][] = $layer;
        $index = array_key_last($this->scene['layers']);

        return new LayerBuilder($this->project, $this->scene['layers'][$index]);
    }
}
