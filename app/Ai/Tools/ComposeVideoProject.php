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
Create or update the current chat's video project from a complete JSON composition plan. Use this whenever the user wants to compose scenes, text, media layers, global overlays, audio tracks, or subtitles.

Top level: resolution_width, resolution_height, fps, scenes[], audio_tracks[], video_tracks[], subtitle_tracks[].

TIMELINE MODEL — every element (a scene layer and a video-track clip are the same thing) is a timeline element:
- start_ms / end_ms: ABSOLUTE milliseconds on the project timeline; end_ms is exclusive. Omit them inside a scene and the element inherits the scene's span, which is the running sum of the preceding scenes' duration_ms.
- track_id: the id of the track (or scene) the element sits on; filled in for you when omitted.
- type: video | image | text | shape. Use existing asset IDs for image/video/audio media.
- Layout: x, y, width, height, z_index, opacity, rotation, fit (cover | contain | fill for video/image).
- Text: text, font_size, font_color, stroke_color, stroke_width. Media: trim_start_ms, trim_end_ms, speed, volume, muted.
- adjustments: { brightness (-1..1), contrast (0..2), saturation (0..2) }.

MOTION — animate an element with a `keyframes` object mapping a property path to a list of keyframes:
  "keyframes": { "x": [ { "time_ms": 0, "value": 0, "easing": "ease-out" }, { "time_ms": 1000, "value": 240 } ] }
- Animatable property paths: x, y, width, height, rotation, opacity, volume, adjustments.brightness, adjustments.contrast, adjustments.saturation.
- time_ms is ELEMENT-LOCAL (measured from the element's own start_ms), so the animation travels with the element when it moves.
- easing: linear, ease, ease-in, ease-out, ease-in-out, hold, or a cubic-bezier array of exactly four numbers, e.g. [0.4, 0, 0.2, 1]. Omit it for linear.
- Prefer two or three keyframes for slow pushes, drifts and fades; keep values inside each property's normal range (opacity 0..1).

Scenes remain a convenient grouping (id, duration_ms, background_color, transition, layers[]) and are a view over the same absolute timeline.
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
     * Give every scene, track, layer, clip and subtitle entry a stable UUID.
     *
     * Only the structural lists are recursed into: an element's `keyframes`
     * map is data, not a list of identified items, so it passes through
     * untouched — as does every other element field, including the timeline's
     * `start_ms`/`end_ms`/`track_id`, which the model fills in when omitted.
     *
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
