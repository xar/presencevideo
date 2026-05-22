<?php

namespace App\Ai\Tools;

use App\Enums\ProjectStatus;
use App\Models\Project;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;
use InvalidArgumentException;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

class ComposeVideoProject implements Tool
{
    public function __construct(protected ?object $user = null) {}

    public function name(): string
    {
        return 'compose_video_project';
    }

    /**
     * Get the description of the tool's purpose.
     */
    public function description(): Stringable|string
    {
        return <<<'DESCRIPTION'
Create or update the current chat's video project from a complete JSON composition plan. Use this whenever the user wants to compose scenes, text, media layers, global overlays, audio tracks, or subtitles. The JSON should follow the ProjectComposer docs: resolution_width, resolution_height, fps, scenes[], audio_tracks[], video_tracks[], subtitle_tracks[]. Layers/clips may include layout fields x, y, width, height, z_index, opacity, font_size, font_color, stroke_color, stroke_width, trim_start_ms, trim_end_ms. Use existing asset IDs when adding image, video, or audio media.
DESCRIPTION;
    }

    /**
     * Execute the tool.
     */
    public function handle(Request $request): Stringable|string
    {
        $data = $this->decodeComposition($request['composition_json']);
        $project = $this->resolveProject($request, $data);

        $project->forceFill([
            'resolution_width' => (int) ($data['resolution_width'] ?? $data['width'] ?? $project->resolution_width),
            'resolution_height' => (int) ($data['resolution_height'] ?? $data['height'] ?? $project->resolution_height),
            'fps' => (int) ($data['fps'] ?? $project->fps),
            'scenes' => $this->normalizeItems($data['scenes'] ?? []),
            'audio_tracks' => $this->normalizeItems($data['audio_tracks'] ?? []),
            'video_tracks' => $this->normalizeItems($data['video_tracks'] ?? []),
            'subtitle_tracks' => $this->normalizeItems($data['subtitle_tracks'] ?? []),
        ])->save();

        return json_encode([
            'project_id' => $project->id,
            'name' => $project->name,
            'resolution' => $project->resolution_width.'x'.$project->resolution_height,
            'fps' => $project->fps,
            'scenes' => count($project->scenes ?? []),
            'audio_tracks' => count($project->audio_tracks ?? []),
            'video_tracks' => count($project->video_tracks ?? []),
            'subtitle_tracks' => count($project->subtitle_tracks ?? []),
            'message' => 'Video project composition saved. Continue using this project_id for future edits in this chat.',
        ], JSON_THROW_ON_ERROR);
    }

    /**
     * Get the tool's schema definition.
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'project_id' => $schema->integer(),
            'name' => $schema->string(),
            'composition_json' => $schema->string()->required(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    protected function decodeComposition(string $compositionJson): array
    {
        $data = json_decode($compositionJson, true, flags: JSON_THROW_ON_ERROR);

        if (! is_array($data)) {
            throw new InvalidArgumentException('The composition_json must decode to an object.');
        }

        return $data;
    }

    /**
     * @param  array<mixed>  $items
     * @return array<int, mixed>
     */
    protected function normalizeItems(array $items): array
    {
        return array_values(array_map(function (mixed $item): mixed {
            if (! is_array($item)) {
                return $item;
            }

            if (! isset($item['id']) || ! is_string($item['id']) || ! Str::isUuid($item['id'])) {
                $item['id'] = (string) Str::uuid();
            }

            foreach (['layers', 'clips', 'entries'] as $nestedKey) {
                if (isset($item[$nestedKey]) && is_array($item[$nestedKey])) {
                    $item[$nestedKey] = $this->normalizeItems($item[$nestedKey]);
                }
            }

            return $item;
        }, $items));
    }

    /**
     * @param  array<string, mixed>  $data
     */
    protected function resolveProject(Request $request, array $data): Project
    {
        $projectId = $request['project_id'] ?? Arr::get($data, 'project_id');

        if ($projectId !== null) {
            $query = Project::query()->whereKey($projectId);

            if ($this->user?->id !== null) {
                $query->where('user_id', $this->user->id);
            }

            return $query->firstOrFail();
        }

        return Project::create([
            'user_id' => $this->user?->id,
            'name' => (string) ($request['name'] ?? Arr::get($data, 'name', 'Untitled agent video')),
            'resolution_width' => (int) ($data['resolution_width'] ?? $data['width'] ?? 1080),
            'resolution_height' => (int) ($data['resolution_height'] ?? $data['height'] ?? 1920),
            'fps' => (int) ($data['fps'] ?? 30),
            'scenes' => [],
            'audio_tracks' => [],
            'video_tracks' => [],
            'subtitle_tracks' => [],
            'status' => ProjectStatus::Draft,
        ]);
    }
}
