<?php

namespace App\Video\Composition\Data;

use Illuminate\Support\Str;

readonly class SceneData implements SerializesToArray
{
    /**
     * @param  array<int, array<string, mixed>>  $layers
     */
    public function __construct(
        public string $id,
        public int $durationMs,
        public array $layers = [],
        public ?string $name = null,
        public ?string $backgroundColor = null,
    ) {}

    /**
     * @param  array<string, mixed>  $attributes
     */
    public static function fromArray(array $attributes): self
    {
        return new self(
            id: (string) ($attributes['id'] ?? Str::uuid()),
            durationMs: (int) ($attributes['duration_ms'] ?? 5000),
            layers: $attributes['layers'] ?? [],
            name: $attributes['name'] ?? null,
            backgroundColor: $attributes['background_color'] ?? null,
        );
    }

    public function toArray(): array
    {
        return array_filter([
            'id' => $this->id,
            'name' => $this->name,
            'duration_ms' => $this->durationMs,
            'background_color' => $this->backgroundColor,
            'layers' => $this->layers,
        ], fn (mixed $value): bool => $value !== null);
    }
}
