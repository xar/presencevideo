<?php

namespace App\Video\Composition;

use App\Models\Asset;
use App\Models\Project;
use Illuminate\Support\Str;

class VideoTrackBuilder
{
    /**
     * @param  array<string, mixed>  $track
     */
    public function __construct(protected Project $project, protected array &$track) {}

    public function visible(bool $visible = true): self
    {
        $this->track['visible'] = $visible;

        return $this;
    }

    public function video(Asset|int $asset): LayerBuilder
    {
        return $this->clip('video', ['asset_id' => $asset instanceof Asset ? $asset->id : $asset]);
    }

    public function text(string $text): LayerBuilder
    {
        return $this->clip('text', ['text' => $text, 'font_size' => 48, 'font_color' => '#ffffff']);
    }

    /**
     * @param  array<string, mixed>  $extra
     */
    protected function clip(string $type, array $extra): LayerBuilder
    {
        $this->track['clips'] ??= [];
        $this->track['clips'][] = [
            'id' => (string) Str::uuid(),
            'type' => $type,
            'start_ms' => 0,
            'duration_ms' => 1000,
            'x' => 0,
            'y' => 0,
            'width' => $this->project->resolution_width,
            'height' => $this->project->resolution_height,
            'z_index' => count($this->track['clips']),
            ...$extra,
        ];

        $index = array_key_last($this->track['clips']);

        return new LayerBuilder($this->project, $this->track['clips'][$index]);
    }
}
