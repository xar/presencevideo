<?php

namespace App\Ai\Tools;

use App\Ai\Tools\Concerns\ResolvesUserProject;
use App\Enums\ProjectStatus;
use App\Models\BrandKit;
use App\Models\Project;
use App\Services\ModelCliService;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Str;
use InvalidArgumentException;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

class ApplyVideoRecipe implements Tool
{
    use ResolvesUserProject;

    public function __construct(protected ?object $user = null, protected ?ModelCliService $cli = null) {}

    public function name(): string
    {
        return 'apply_video_recipe';
    }

    public function description(): Stringable|string
    {
        return <<<'DESCRIPTION'
Build a complete video composition deterministically from script beats using a recipe (see list_video_recipes) and the project's brand kit, then save it and lint it. Prefer this over composing JSON by hand.
beats_json is a JSON array of beats: {id, kind: hook|body|cta, headline, sub?, voiceover?, duration_ms, asset_id?, asset_type?: image|video, voice_asset_id?, words?: [{text, start_ms, end_ms}] (relative to the beat start)}.
Omit project_id to create a new project (pass name, brand_kit_id, resolution). The recipe places headlines inside the platform safe zone, adds captions from words, motion presets, the brand logo, the outro and music (music_asset_id).
DESCRIPTION;
    }

    public function handle(Request $request): Stringable|string
    {
        $beats = json_decode((string) $request['beats_json'], true, flags: JSON_THROW_ON_ERROR);

        if (! is_array($beats) || $beats === []) {
            throw new InvalidArgumentException('beats_json must decode to a non-empty array of beats.');
        }

        $project = $this->resolveProject($request);
        $project->loadMissing('brandKit');
        $cli = $this->cli ?? app(ModelCliService::class);

        $result = $cli->applyRecipe((string) $request['recipe'], [
            'beats' => array_values($beats),
            'canvas' => ['width' => $project->resolution_width, 'height' => $project->resolution_height],
            'fps' => $project->fps,
            'brand' => $project->brandKit instanceof BrandKit ? $project->brandKit->toArray() : null,
            'music_asset_id' => $request['music_asset_id'] ?? null,
            'caption_preset' => $request['caption_preset'] ?? null,
        ]);

        $built = $result['project'] ?? [];
        $idMap = [];

        $project->forceFill([
            'scenes' => $this->normalizeItems($built['scenes'] ?? [], $idMap),
            'video_tracks' => $this->normalizeItems($built['video_tracks'] ?? [], $idMap),
            'audio_tracks' => $this->normalizeItems($built['audio_tracks'] ?? [], $idMap),
            'subtitle_tracks' => $this->normalizeItems($built['subtitle_tracks'] ?? [], $idMap),
        ])->save();

        return json_encode([
            'project_id' => $project->id,
            'name' => $project->name,
            'brand_kit_id' => $project->brand_kit_id,
            'recipe' => $request['recipe'],
            'scenes' => count($project->scenes ?? []),
            'lint' => $result['lint'] ?? null,
            'message' => 'Recipe applied and saved. Use patch_video_project for targeted edits and lint_video_project to re-check.',
        ], JSON_THROW_ON_ERROR);
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'recipe' => $schema->string()->required(),
            'beats_json' => $schema->string()->required(),
            'project_id' => $schema->integer(),
            'name' => $schema->string(),
            'brand_kit_id' => $schema->integer(),
            'music_asset_id' => $schema->integer(),
            'caption_preset' => $schema->string(),
            'resolution_width' => $schema->integer(),
            'resolution_height' => $schema->integer(),
            'fps' => $schema->integer(),
        ];
    }

    protected function resolveProject(Request $request): Project
    {
        if (($request['project_id'] ?? null) !== null) {
            $project = $this->userProject($request['project_id']);

            if (($request['brand_kit_id'] ?? null) !== null) {
                $project->forceFill(['brand_kit_id' => $this->userBrandKitId($request['brand_kit_id'])])->save();
            }

            return $project;
        }

        return Project::create([
            'user_id' => $this->user?->id,
            'name' => (string) ($request['name'] ?? 'Untitled agent video'),
            'resolution_width' => (int) ($request['resolution_width'] ?? 1080),
            'resolution_height' => (int) ($request['resolution_height'] ?? 1920),
            'fps' => (int) ($request['fps'] ?? 30),
            'brand_kit_id' => ($request['brand_kit_id'] ?? null) !== null ? $this->userBrandKitId($request['brand_kit_id']) : null,
            'scenes' => [],
            'audio_tracks' => [],
            'video_tracks' => [],
            'subtitle_tracks' => [],
            'status' => ProjectStatus::Draft,
        ]);
    }

    protected function userBrandKitId(mixed $kitId): int
    {
        return BrandKit::query()
            ->whereKey($kitId)
            ->when($this->user?->id !== null, fn ($query) => $query->where('user_id', $this->user->id))
            ->firstOrFail()
            ->id;
    }

    /**
     * Recipes emit deterministic, human-readable ids; storage wants UUIDs.
     *
     * Same walk as ComposeVideoProject::normalizeItems(), plus one thing that
     * walk does not need: a recipe's scene layers carry `track_id` = their
     * scene's id, so every id that is rewritten is remembered and the
     * references are rewritten with it. Otherwise the layer would point at a
     * scene id that no longer exists.
     *
     * @param  array<mixed>  $items
     * @param  array<string, string>  $idMap
     * @return array<int, mixed>
     */
    protected function normalizeItems(array $items, array &$idMap = []): array
    {
        return array_values(array_map(function (mixed $item) use (&$idMap): mixed {
            if (! is_array($item)) {
                return $item;
            }

            if (! isset($item['id']) || ! is_string($item['id']) || ! Str::isUuid($item['id'])) {
                $original = is_string($item['id'] ?? null) ? $item['id'] : null;
                $item['id'] = $original !== null && isset($idMap[$original]) ? $idMap[$original] : (string) Str::uuid();

                if ($original !== null) {
                    $idMap[$original] = $item['id'];
                }
            }

            if (is_string($item['track_id'] ?? null) && isset($idMap[$item['track_id']])) {
                $item['track_id'] = $idMap[$item['track_id']];
            }

            foreach (['layers', 'clips', 'entries'] as $nestedKey) {
                if (isset($item[$nestedKey]) && is_array($item[$nestedKey])) {
                    $item[$nestedKey] = $this->normalizeItems($item[$nestedKey], $idMap);
                }
            }

            return $item;
        }, $items));
    }
}
