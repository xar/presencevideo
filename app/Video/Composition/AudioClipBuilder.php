<?php

namespace App\Video\Composition;

class AudioClipBuilder
{
    /**
     * @param  array<string, mixed>  $clip
     */
    public function __construct(protected array &$clip) {}

    public function start(int $startMs): self
    {
        $this->clip['start_ms'] = $startMs;

        return $this;
    }

    public function duration(int $durationMs): self
    {
        $this->clip['duration_ms'] = $durationMs;

        return $this;
    }

    public function trim(int $startMs): self
    {
        $this->clip['trim_start_ms'] = $startMs;

        return $this;
    }

    public function volume(float $volume): self
    {
        $this->clip['volume'] = max(0, min(2, $volume));

        return $this;
    }

    public function fadeIn(int $durationMs): self
    {
        $this->clip['fade_in_ms'] = $durationMs;

        return $this;
    }

    public function fadeOut(int $durationMs): self
    {
        $this->clip['fade_out_ms'] = $durationMs;

        return $this;
    }
}
