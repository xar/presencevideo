<?php

namespace App\Video\Composition\Data;

use Illuminate\Support\Str;

readonly class TrackData implements SerializesToArray
{
    /**
     * @param  array<int, array<string, mixed>>  $items
     * @param  array<string, mixed>  $extra
     */
    public function __construct(
        public string $id,
        public string $name,
        public string $itemsKey,
        public array $items = [],
        public array $extra = [],
    ) {}

    public static function audio(string $name): self
    {
        return new self((string) Str::uuid(), $name, 'clips', [], ['volume' => 1.0]);
    }

    public static function video(string $name): self
    {
        return new self((string) Str::uuid(), $name, 'clips', [], ['visible' => true]);
    }

    public static function subtitles(string $name): self
    {
        return new self((string) Str::uuid(), $name, 'entries', [], [
            'enabled' => true,
            'style' => StyleData::subtitle()->toArray(),
        ]);
    }

    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            ...$this->extra,
            $this->itemsKey => $this->items,
        ];
    }
}
