<?php

namespace App\Services;

use App\Models\BrandKit;
use App\Models\Project;
use RuntimeException;
use Symfony\Component\Process\Process;

/**
 * PHP's door into the pure TypeScript model.
 *
 * Lint rules, recipes and brand token resolution live in
 * `resources/js/lib/editor/model`. Porting them to PHP would recreate the
 * parity burden the timeline math already carries, so the agents run the
 * esbuild bundle of `resources/js/headless/model-cli.ts` under Node instead:
 * one JSON request on stdin, one JSON response on stdout, one process per
 * call.
 */
class ModelCliService
{
    /**
     * @param  array<string, mixed>  $project  The `get_video_project` shape plus `assets` and `brand_kit`.
     * @return array<string, mixed> A LintReport
     */
    public function lint(array $project, string $profile = 'tiktok'): array
    {
        return $this->request(['op' => 'lint', 'project' => $project, 'profile' => $profile]);
    }

    /**
     * @param  array<string, mixed>  $input  A RecipeInput
     * @return array{project: array<string, mixed>, lint: array<string, mixed>}
     */
    public function applyRecipe(string $recipe, array $input): array
    {
        return $this->request(['op' => 'apply_recipe', 'recipe' => $recipe, 'input' => $input]);
    }

    /**
     * @return array<int, array{id: string, name: string, description: string, slots: array<string, mixed>}>
     */
    public function listRecipes(): array
    {
        return $this->request(['op' => 'list_recipes']);
    }

    /**
     * @param  array<string, mixed>|null  $kit
     * @return array{ok: bool, missing: list<string>}
     */
    public function validateBrandKit(string $recipe, ?array $kit): array
    {
        return $this->request(['op' => 'validate_brand_kit', 'recipe' => $recipe, 'brand_kit' => $kit]);
    }

    /**
     * The project array the model expects: stored lists plus the assets the
     * lint's `missing-asset` rule checks against and the brand kit tokens
     * resolve through.
     *
     * @return array<string, mixed>
     */
    public static function projectPayload(Project $project): array
    {
        $project->loadMissing(['assets', 'brandKit']);

        return [
            'id' => $project->id,
            'name' => $project->name,
            'resolution_width' => $project->resolution_width,
            'resolution_height' => $project->resolution_height,
            'fps' => $project->fps,
            'scenes' => $project->scenes ?? [],
            'audio_tracks' => $project->audio_tracks ?? [],
            'video_tracks' => $project->video_tracks ?? [],
            'subtitle_tracks' => $project->subtitle_tracks ?? [],
            'brand_kit_id' => $project->brand_kit_id,
            'brand_kit' => $project->brandKit instanceof BrandKit ? $project->brandKit->toArray() : null,
            'assets' => $project->assets->map(fn ($asset): array => [
                'id' => $asset->id,
                'type' => $asset->type->value,
                'name' => $asset->name,
                'duration_ms' => $asset->duration_ms,
                'width' => $asset->width,
                'height' => $asset->height,
            ])->values()->all(),
        ];
    }

    public function bundlePath(): string
    {
        return (string) config('render.model_cli.bundle_path');
    }

    public function isAvailable(): bool
    {
        return is_file($this->bundlePath());
    }

    /**
     * @param  array<string, mixed>  $request
     * @return mixed The `result` member of the response
     */
    protected function request(array $request): mixed
    {
        $bundle = $this->bundlePath();

        if (! is_file($bundle)) {
            throw new RuntimeException("The model CLI bundle is missing at {$bundle}. Run `npm run build:model-cli`.");
        }

        $process = new Process(
            [(string) config('render.headless.node_binary', 'node'), $bundle],
            base_path(),
            null,
            json_encode($request, JSON_THROW_ON_ERROR),
            (float) config('render.model_cli.timeout', 60),
        );

        $process->run();

        $decoded = json_decode(trim($process->getOutput()), true);

        if (! is_array($decoded)) {
            throw new RuntimeException('The model CLI returned no JSON response: '.trim($process->getErrorOutput().' '.$process->getOutput()));
        }

        if (($decoded['ok'] ?? false) !== true) {
            throw new RuntimeException('The model CLI reported an error: '.($decoded['error'] ?? 'unknown error'));
        }

        return $decoded['result'] ?? null;
    }
}
