<?php

namespace App\Video\Composition;

use App\Models\Project;

class LayerBuilder
{
    /**
     * @param  array<string, mixed>  $layer
     */
    public function __construct(
        protected Project $project,
        protected array &$layer,
    ) {}

    public function position(int $x, int $y): self
    {
        $this->layer['x'] = $x;
        $this->layer['y'] = $y;

        return $this;
    }

    public function size(int $width, int $height): self
    {
        $this->layer['width'] = $width;
        $this->layer['height'] = $height;

        return $this;
    }

    public function center(): self
    {
        return $this->position(
            (int) (($this->project->resolution_width - ($this->layer['width'] ?? 0)) / 2),
            (int) (($this->project->resolution_height - ($this->layer['height'] ?? 0)) / 2),
        );
    }

    public function fill(): self
    {
        return $this->position(0, 0)->size($this->project->resolution_width, $this->project->resolution_height);
    }

    public function cover(): self
    {
        return $this->fill();
    }

    public function contain(int $margin = 0): self
    {
        return $this->position($margin, $margin)->size(
            max(1, $this->project->resolution_width - ($margin * 2)),
            max(1, $this->project->resolution_height - ($margin * 2)),
        );
    }

    public function safeArea(int $margin = 80): self
    {
        return $this->contain($margin);
    }

    public function zIndex(int $zIndex): self
    {
        $this->layer['z_index'] = $zIndex;

        return $this;
    }

    public function opacity(float $opacity): self
    {
        $this->layer['opacity'] = max(0, min(1, $opacity));

        return $this;
    }

    public function fontSize(int $fontSize): self
    {
        $this->layer['font_size'] = $fontSize;

        return $this;
    }

    public function color(string $color): self
    {
        $this->layer['font_color'] = $color;

        return $this;
    }

    public function stroke(string $color, int $width): self
    {
        $this->layer['stroke_color'] = $color;
        $this->layer['stroke_width'] = $width;

        return $this;
    }

    public function trim(int $startMs, ?int $endMs = null): self
    {
        $this->layer['trim_start_ms'] = $startMs;

        if ($endMs !== null) {
            $this->layer['trim_end_ms'] = $endMs;
        }

        return $this;
    }
}
