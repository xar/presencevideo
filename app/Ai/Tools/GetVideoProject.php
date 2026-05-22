<?php

namespace App\Ai\Tools;

use App\Models\Project;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

class GetVideoProject implements Tool
{
    public function __construct(protected ?object $user = null) {}

    public function name(): string
    {
        return 'get_video_project';
    }

    public function description(): Stringable|string
    {
        return 'Read a video project composition JSON so you can inspect or revise scenes, layers, tracks, subtitles, resolution, and fps.';
    }

    public function handle(Request $request): Stringable|string
    {
        $project = Project::query()
            ->whereKey($request['project_id'])
            ->when($this->user?->id !== null, fn ($query) => $query->where('user_id', $this->user->id))
            ->firstOrFail();

        return json_encode([
            'project_id' => $project->id,
            'name' => $project->name,
            'resolution_width' => $project->resolution_width,
            'resolution_height' => $project->resolution_height,
            'fps' => $project->fps,
            'scenes' => $project->scenes ?? [],
            'audio_tracks' => $project->audio_tracks ?? [],
            'video_tracks' => $project->video_tracks ?? [],
            'subtitle_tracks' => $project->subtitle_tracks ?? [],
        ], JSON_THROW_ON_ERROR);
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'project_id' => $schema->integer()->required(),
        ];
    }
}
