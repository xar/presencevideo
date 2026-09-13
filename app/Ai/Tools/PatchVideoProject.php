<?php

namespace App\Ai\Tools;

use App\Ai\Composition\ProjectPatcher;
use App\Ai\Tools\Concerns\ResolvesUserProject;
use App\Models\Project;
use App\Services\ModelCliService;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use InvalidArgumentException;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;
use Throwable;

class PatchVideoProject implements Tool
{
    use ResolvesUserProject;

    public function __construct(protected ?object $user = null, protected ?ModelCliService $cli = null) {}

    public function name(): string
    {
        return 'patch_video_project';
    }

    public function description(): Stringable|string
    {
        return <<<'DESCRIPTION'
Apply a list of small operations to an existing video project instead of rewriting the whole composition. operations_json is a JSON array of objects, each with an "op":
- set_project {resolution_width?, resolution_height?, fps?, brand_kit_id?, name?}
- set_scene {scene_id, duration_ms?, name?, background_color?, transition?: {type, duration_ms}}
- add_scene {scene: {name?, duration_ms, background_color?, layers?: []}, index?}
- remove_scene {scene_id}
- add_element {scene_id | track_id, element: {type: video|image|text|shape, x, y, width, height, z_index, ...}}
- update_element {element_id, fields: {...}}  (merges fields; use for moving out of safe zones, resizing text, swapping colours to brand.* tokens, adding keyframes)
- remove_element {element_id}
- set_subtitle_style {track_id?, style: {font_size?, font_color?, highlight_color?, position?, preset?, ...}}
- add_subtitle_entries {track_id?, entries: [{start_ms, end_ms, text, words?}]}
- add_audio_clip {track_id? | track_name?, clip: {asset_id, start_ms, end_ms | duration_ms, volume?}}
Ids come from get_video_project or lint_video_project. Returns the applied ops and a fresh lint report.
DESCRIPTION;
    }

    public function handle(Request $request): Stringable|string
    {
        $project = $this->userProject($request['project_id']);
        $operations = json_decode((string) $request['operations_json'], true, flags: JSON_THROW_ON_ERROR);

        if (! is_array($operations)) {
            throw new InvalidArgumentException('operations_json must decode to an array of operations.');
        }

        try {
            $result = ProjectPatcher::apply(ModelCliService::projectPayload($project), $operations);
        } catch (InvalidArgumentException $exception) {
            return json_encode(['project_id' => $project->id, 'applied' => [], 'error' => $exception->getMessage()], JSON_THROW_ON_ERROR);
        }

        $patched = $result['project'];

        $project->forceFill([
            'name' => (string) ($patched['name'] ?? $project->name),
            'resolution_width' => (int) ($patched['resolution_width'] ?? $project->resolution_width),
            'resolution_height' => (int) ($patched['resolution_height'] ?? $project->resolution_height),
            'fps' => (int) ($patched['fps'] ?? $project->fps),
            'brand_kit_id' => $patched['brand_kit_id'] ?? null,
            'scenes' => $patched['scenes'] ?? [],
            'audio_tracks' => $patched['audio_tracks'] ?? [],
            'video_tracks' => $patched['video_tracks'] ?? [],
            'subtitle_tracks' => $patched['subtitle_tracks'] ?? [],
        ])->save();

        return json_encode([
            'project_id' => $project->id,
            'applied' => $result['applied'],
            'lint' => $this->lint($project->fresh(['assets', 'brandKit']), (string) ($request['profile'] ?? 'tiktok')),
        ], JSON_THROW_ON_ERROR);
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'project_id' => $schema->integer()->required(),
            'operations_json' => $schema->string()->required(),
            'profile' => $schema->string(),
        ];
    }

    /**
     * A patch must save even when the CLI bundle is unavailable; the lint is
     * feedback, not a gate.
     *
     * @return array<string, mixed>|null
     */
    protected function lint(Project $project, string $profile): ?array
    {
        try {
            return ($this->cli ?? app(ModelCliService::class))->lint(ModelCliService::projectPayload($project), $profile);
        } catch (Throwable $exception) {
            return ['unavailable' => $exception->getMessage()];
        }
    }
}
