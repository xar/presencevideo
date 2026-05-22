<?php

namespace App\Video\Composition;

use App\Models\Asset;
use Illuminate\Support\Str;

class AudioTrackBuilder
{
    /**
     * @param  array<string, mixed>  $track
     */
    public function __construct(protected array &$track) {}

    public function volume(float $volume): self
    {
        $this->track['volume'] = max(0, min(2, $volume));

        return $this;
    }

    public function clip(Asset|int $asset): AudioClipBuilder
    {
        $this->track['clips'] ??= [];
        $this->track['clips'][] = [
            'id' => (string) Str::uuid(),
            'asset_id' => $asset instanceof Asset ? $asset->id : $asset,
            'start_ms' => 0,
            'duration_ms' => $asset instanceof Asset && $asset->duration_ms ? $asset->duration_ms : 1000,
            'volume' => 1.0,
        ];

        $index = array_key_last($this->track['clips']);

        return new AudioClipBuilder($this->track['clips'][$index]);
    }
}
