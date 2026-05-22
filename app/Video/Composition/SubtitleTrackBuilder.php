<?php

namespace App\Video\Composition;

use App\Video\Composition\Data\StyleData;
use Illuminate\Support\Str;

class SubtitleTrackBuilder
{
    /**
     * @param  array<string, mixed>  $track
     */
    public function __construct(protected array &$track) {}

    public function style(StyleData|array $style): self
    {
        $this->track['style'] = $style instanceof StyleData ? $style->toArray() : $style;

        return $this;
    }

    public function entry(int $startMs, int $endMs, string $text): self
    {
        $this->track['entries'] ??= [];
        $this->track['entries'][] = [
            'id' => (string) Str::uuid(),
            'start_ms' => $startMs,
            'end_ms' => $endMs,
            'text' => $text,
        ];

        return $this;
    }
}
