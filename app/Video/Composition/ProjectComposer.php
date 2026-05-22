<?php

namespace App\Video\Composition;

use App\Models\Project;
use App\Video\Composition\Data\TrackData;
use Illuminate\Support\Str;

class ProjectComposer
{
    /**
     * @var array<int, array<string, mixed>>
     */
    protected array $scenes;

    /**
     * @var array<int, array<string, mixed>>
     */
    protected array $audioTracks;

    /**
     * @var array<int, array<string, mixed>>
     */
    protected array $videoTracks;

    /**
     * @var array<int, array<string, mixed>>
     */
    protected array $subtitleTracks;

    public function __construct(protected Project $project)
    {
        $this->scenes = $project->scenes ?? [];
        $this->audioTracks = $project->audio_tracks ?? [];
        $this->videoTracks = $project->video_tracks ?? [];
        $this->subtitleTracks = $project->subtitle_tracks ?? [];
    }

    public static function for(Project $project): self
    {
        return new self($project);
    }

    public function resolution(int $width, int $height): self
    {
        $this->project->resolution_width = $width;
        $this->project->resolution_height = $height;

        return $this;
    }

    public function fps(int $fps): self
    {
        $this->project->fps = $fps;

        return $this;
    }

    public function scene(?string $name = null, int $durationMs = 5000): SceneBuilder
    {
        $this->scenes[] = [
            'id' => (string) Str::uuid(),
            'name' => $name,
            'duration_ms' => $durationMs,
            'layers' => [],
        ];

        $index = array_key_last($this->scenes);

        return new SceneBuilder($this->project, $this->scenes[$index]);
    }

    public function audioTrack(string $name): AudioTrackBuilder
    {
        $this->audioTracks[] = TrackData::audio($name)->toArray();
        $index = array_key_last($this->audioTracks);

        return new AudioTrackBuilder($this->audioTracks[$index]);
    }

    public function videoTrack(string $name): VideoTrackBuilder
    {
        $this->videoTracks[] = TrackData::video($name)->toArray();
        $index = array_key_last($this->videoTracks);

        return new VideoTrackBuilder($this->project, $this->videoTracks[$index]);
    }

    public function subtitles(string $name = 'Subtitles'): SubtitleTrackBuilder
    {
        $this->subtitleTracks[] = TrackData::subtitles($name)->toArray();
        $index = array_key_last($this->subtitleTracks);

        return new SubtitleTrackBuilder($this->subtitleTracks[$index]);
    }

    public function save(): Project
    {
        $this->project->forceFill([
            'scenes' => array_values($this->scenes),
            'audio_tracks' => array_values($this->audioTracks),
            'video_tracks' => array_values($this->videoTracks),
            'subtitle_tracks' => array_values($this->subtitleTracks),
        ])->save();

        return $this->project->refresh();
    }
}
