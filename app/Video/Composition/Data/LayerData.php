<?php

namespace App\Video\Composition\Data;

use App\Models\Project;
use Illuminate\Support\Str;

readonly class LayerData implements SerializesToArray
{
    /**
     * @param  array<string, mixed>  $extra
     */
    public function __construct(
        public string $id,
        public string $type,
        public int $x,
        public int $y,
        public int $width,
        public int $height,
        public int $zIndex = 0,
        public float $opacity = 1.0,
        public array $extra = [],
    ) {}

    /**
     * Geometry defaults come from the project so that this class, the model's
     * `normalizeElement()` and the render pipeline agree on where an element
     * with no size lands. Without a project the canonical 1920x1080 canvas is
     * assumed, exactly as the model does.
     *
     * @param  array<string, mixed>  $attributes
     */
    public static function fromArray(array $attributes, ?Project $project = null): self
    {
        $project ??= new Project([
            'resolution_width' => Project::DEFAULT_RESOLUTION_WIDTH,
            'resolution_height' => Project::DEFAULT_RESOLUTION_HEIGHT,
        ]);

        return new self(
            id: (string) ($attributes['id'] ?? Str::uuid()),
            type: (string) $attributes['type'],
            x: (int) ($attributes['x'] ?? 0),
            y: (int) ($attributes['y'] ?? 0),
            width: (int) ($attributes['width'] ?? $project->defaultElementWidth()),
            height: (int) ($attributes['height'] ?? $project->defaultElementHeight()),
            zIndex: (int) ($attributes['z_index'] ?? 0),
            opacity: (float) ($attributes['opacity'] ?? 1.0),
            extra: array_diff_key($attributes, array_flip(['id', 'type', 'x', 'y', 'width', 'height', 'z_index', 'opacity'])),
        );
    }

    public function toArray(): array
    {
        return array_filter([
            'id' => $this->id,
            'type' => $this->type,
            'x' => $this->x,
            'y' => $this->y,
            'width' => $this->width,
            'height' => $this->height,
            'z_index' => $this->zIndex,
            'opacity' => $this->opacity,
            ...$this->extra,
        ], fn (mixed $value): bool => $value !== null);
    }
}
