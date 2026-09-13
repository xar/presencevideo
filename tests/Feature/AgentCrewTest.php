<?php

use App\Ai\Agents\ComposerAgent;
use App\Ai\Agents\CreatorAgent;
use App\Ai\Agents\GenericAgent;
use App\Ai\Agents\ReviewerAgent;
use App\Ai\Agents\ScriptAgent;
use App\Ai\Tools\ApplyVideoRecipe;
use App\Ai\Tools\GenerateFalAsset;
use App\Ai\Tools\GetBrandKit;
use App\Ai\Tools\LintVideoProject;
use App\Ai\Tools\ListBrandKits;
use App\Ai\Tools\ListVideoRecipes;
use App\Ai\Tools\PatchVideoProject;
use App\Ai\Tools\RenderVideoProject;
use App\Ai\Tools\SetProjectBrandKit;
use App\Models\BrandKit;
use App\Models\Project;
use App\Models\User;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\JsonSchema\JsonSchemaTypeFactory;
use Laravel\Ai\Contracts\HasStructuredOutput;
use Laravel\Ai\Tools\Request;

function toolClasses(iterable $tools): array
{
    return collect($tools)->map(fn ($tool) => $tool::class)->values()->all();
}

it('wires the producer to the crew and gives each specialist only its own tools', function () {
    $user = User::factory()->create();

    $producer = toolClasses((new GenericAgent)->forUser($user)->tools());
    $composer = toolClasses((new ComposerAgent)->forUser($user)->tools());
    $reviewer = toolClasses((new ReviewerAgent)->forUser($user)->tools());
    $creator = toolClasses((new CreatorAgent)->forUser($user)->tools());

    expect($producer)->toContain(ScriptAgent::class, CreatorAgent::class, ComposerAgent::class, ReviewerAgent::class)
        ->and($producer)->not->toContain(ApplyVideoRecipe::class, GenerateFalAsset::class, RenderVideoProject::class)
        ->and($composer)->toContain(ApplyVideoRecipe::class, PatchVideoProject::class, LintVideoProject::class, ListVideoRecipes::class, ListBrandKits::class, GetBrandKit::class, SetProjectBrandKit::class)
        ->and($composer)->not->toContain(GenerateFalAsset::class, RenderVideoProject::class)
        ->and($reviewer)->toContain(LintVideoProject::class, GetBrandKit::class)
        ->and($reviewer)->not->toContain(PatchVideoProject::class, ApplyVideoRecipe::class)
        ->and($creator)->toContain(GenerateFalAsset::class, RenderVideoProject::class)
        ->and($creator)->not->toContain(PatchVideoProject::class, LintVideoProject::class);
});

it('returns structured beats and structured review edits', function () {
    expect(new ScriptAgent)->toBeInstanceOf(HasStructuredOutput::class)
        ->and(new ReviewerAgent)->toBeInstanceOf(HasStructuredOutput::class);

    $schema = new JsonSchemaTypeFactory;
    $beats = (new ScriptAgent)->schema($schema);
    $review = (new ReviewerAgent)->schema($schema);

    expect($beats)->toHaveKeys(['title', 'total_duration_ms', 'beats'])
        ->and($review)->toHaveKeys(['score', 'approved', 'summary', 'edits']);
});

it('documents the crew flow, recipes and brand kits in the agent instructions', function () {
    $producer = (string) (new GenericAgent)->instructions();
    $composer = (string) (new ComposerAgent)->instructions();
    $script = (string) (new ScriptAgent)->instructions();
    $creator = (string) (new CreatorAgent)->instructions();

    expect($producer)
        ->toContain('script_agent')
        ->toContain('composer_agent')
        ->toContain('reviewer_agent')
        ->toContain('At most TWO review rounds')
        ->toContain('Template to recipe map:')
        ->toContain('ugc_ad: recipe tiktok-talking-caption')
        ->toContain('brand_kit_id')
        ->and($composer)
        ->toContain('apply_video_recipe')
        ->toContain('brand.caption_highlight')
        ->toContain('score is at least 80')
        ->toContain('education: recipe tiktok-listicle')
        ->and($script)
        ->toContain('hook')
        ->toContain('Template pacing')
        ->and($creator)
        ->toContain('Composition belongs to composer_agent')
        ->toContain('Respect GenericAgent\'s locked_model_plan');
});

it('lists and reads only the current user\'s brand kits', function () {
    $user = User::factory()->create();
    $mine = BrandKit::factory()->create(['user_id' => $user->id, 'name' => 'Mine']);
    $theirs = BrandKit::factory()->create(['name' => 'Theirs']);

    $list = json_decode((string) (new ListBrandKits($user))->handle(new Request([])), true, flags: JSON_THROW_ON_ERROR);

    expect($list['brand_kits'])->toHaveCount(1)
        ->and($list['brand_kits'][0]['brand_kit_id'])->toBe($mine->id)
        ->and($list['brand_kits'][0]['colors'])->toContain('primary')
        ->and($list['brand_kits'][0]['has_logo'])->toBeFalse();

    $kit = json_decode((string) (new GetBrandKit($user))->handle(new Request(['brand_kit_id' => $mine->id])), true, flags: JSON_THROW_ON_ERROR);

    expect($kit['brand_kit']['colors']['primary'])->toBe('#ff3366')
        ->and($kit['brand_kit']['fonts'])->toHaveKey('display');

    expect(fn () => (new GetBrandKit($user))->handle(new Request(['brand_kit_id' => $theirs->id])))
        ->toThrow(ModelNotFoundException::class);
});

it('attaches and detaches a brand kit on a project', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);
    $kit = BrandKit::factory()->create(['user_id' => $user->id]);
    $foreign = BrandKit::factory()->create();

    $attached = json_decode((string) (new SetProjectBrandKit($user))->handle(new Request([
        'project_id' => $project->id,
        'brand_kit_id' => $kit->id,
    ])), true, flags: JSON_THROW_ON_ERROR);

    expect($attached['brand_kit_id'])->toBe($kit->id)
        ->and($project->fresh()->brand_kit_id)->toBe($kit->id);

    expect(fn () => (new SetProjectBrandKit($user))->handle(new Request(['project_id' => $project->id, 'brand_kit_id' => $foreign->id])))
        ->toThrow(ModelNotFoundException::class);

    (new SetProjectBrandKit($user))->handle(new Request(['project_id' => $project->id]));

    expect($project->fresh()->brand_kit_id)->toBeNull();
});
