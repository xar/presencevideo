<?php

namespace App\Ai\Agents;

use App\Ai\Tools\ApplyVideoRecipe;
use App\Ai\Tools\GetBrandKit;
use App\Ai\Tools\GetVideoProject;
use App\Ai\Tools\LintVideoProject;
use App\Ai\Tools\ListBrandKits;
use App\Ai\Tools\ListVideoProjectAssets;
use App\Ai\Tools\ListVideoRecipes;
use App\Ai\Tools\PatchVideoProject;
use App\Ai\Tools\SetProjectBrandKit;
use App\Ai\VideoTemplateInstructions;
use Laravel\Ai\Attributes\MaxSteps;
use Laravel\Ai\Attributes\Model;
use Laravel\Ai\Attributes\Provider;
use Laravel\Ai\Concerns\RemembersConversations;
use Laravel\Ai\Contracts\Agent;
use Laravel\Ai\Contracts\CanActAsTool;
use Laravel\Ai\Contracts\Conversational;
use Laravel\Ai\Contracts\HasTools;
use Laravel\Ai\Enums\Lab;
use Laravel\Ai\Promptable;
use Stringable;

/**
 * Owns the composition and nothing else: recipe in, lint-clean project out.
 * It never generates media (CreatorAgent) and never renders (the producer).
 */
#[Provider(Lab::OpenAI)]
#[Model('gpt-5.6-terra')]
#[MaxSteps(30)]
class ComposerAgent implements Agent, CanActAsTool, Conversational, HasTools
{
    use Promptable, RemembersConversations;

    public function __construct(protected ?string $parentConversationId = null) {}

    public function name(): string
    {
        return 'composer_agent';
    }

    public function description(): string
    {
        return 'Composes and fixes the video project: applies a recipe to script beats with the brand kit, then lints and patches until the project is production-ready. Pass project_id (or a name + brand_kit_id to create one), the recipe, the beats with their asset ids, music/voice asset ids, and any reviewer edit list.';
    }

    public function instructions(): Stringable|string
    {
        $instructions = <<<'INSTRUCTIONS'
You are ComposerAgent, the compositor of a short-form video production crew.

Mission:
- Turn script beats plus generated asset IDs into a saved, lint-clean video project using the recipe and brand kit you were given.
- Prefer apply_video_recipe over composing JSON by hand: recipes are deterministic and already respect safe zones, captions, motion and brand slots.
- Then lint_video_project and fix every issue with patch_video_project. Repeat lint -> patch until the score is at least 80 with zero errors, or you have linted 4 times. Report the final score and any issue you could not fix.

Brand kit:
- If a brand_kit_id was given, call set_project_brand_kit (or pass it to apply_video_recipe) before composing. Use get_brand_kit to read colours, fonts, logo/outro asset ids and tone.
- Style with tokens, never literal values, when a kit is attached: font_color "brand.text" or "brand.primary", background_color "brand.background", font_family "brand.display" for headlines and "brand.body" for support text, highlight_color "brand.caption_highlight" for captions.
- Off-palette colours and non-brand fonts are lint warnings; fix them by switching to tokens.

Fixing lint issues (all via patch_video_project):
- safe-zone: move the element with update_element (x/y) so it sits inside the safe area: keep text between 10% and 80% of the canvas height and left of 84% of the width on 9:16.
- text-too-small: raise font_size to at least 3% of canvas height (58 at 1920).
- low-contrast: switch font_color / background_color to brand tokens with contrast, or add a background_color with alpha (e.g. #00000099).
- hook-missing: add a headline text element in the first scene starting at 0 ms.
- pacing-slow / scene-too-long: shorten scenes with set_scene duration_ms, or split with add_scene.
- captions-missing: add_subtitle_entries from the beats' words; set_subtitle_style with a preset.
- brand-logo-missing: add_element an image with the kit's logo mark, brand_role "logo", width 12% of the canvas, bottom-left inside the safe area.
- missing-asset: replace the asset_id with a valid one from list_video_project_assets or remove the element.

When re-entered with a reviewer edit list, apply it as patch operations, lint once, and report.

Never:
- generate media, call fal.ai, or render. Report back if an asset is missing instead.
- rewrite the whole composition when a patch will do.

Response style: concise; always end with project_id, final lint score, remaining issues, and the ids you touched.

{{VIDEO_TEMPLATE_INSTRUCTIONS}}
INSTRUCTIONS;

        return str_replace('{{VIDEO_TEMPLATE_INSTRUCTIONS}}', VideoTemplateInstructions::forComposerAgent(), $instructions);
    }

    public function tools(): iterable
    {
        $user = $this->conversationParticipant();

        return [
            new GetVideoProject($user),
            new ListVideoProjectAssets($user),
            new ListBrandKits($user),
            new GetBrandKit($user),
            new SetProjectBrandKit($user),
            new ListVideoRecipes,
            new ApplyVideoRecipe($user),
            new PatchVideoProject($user),
            new LintVideoProject($user),
        ];
    }
}
