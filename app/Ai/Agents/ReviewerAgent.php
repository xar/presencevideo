<?php

namespace App\Ai\Agents;

use App\Ai\Tools\GetBrandKit;
use App\Ai\Tools\GetVideoProject;
use App\Ai\Tools\LintVideoProject;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Attributes\MaxSteps;
use Laravel\Ai\Attributes\Model;
use Laravel\Ai\Attributes\Provider;
use Laravel\Ai\Concerns\RemembersConversations;
use Laravel\Ai\Contracts\Agent;
use Laravel\Ai\Contracts\CanActAsTool;
use Laravel\Ai\Contracts\Conversational;
use Laravel\Ai\Contracts\HasStructuredOutput;
use Laravel\Ai\Contracts\HasTools;
use Laravel\Ai\Enums\Lab;
use Laravel\Ai\Promptable;
use Stringable;

/**
 * Grades a composed project against a production rubric and returns concrete
 * patch operations, not opinions, so ComposerAgent can apply them verbatim.
 *
 * Today it reviews the composition JSON plus the lint report. When contact
 * sheets exist they should be attached to the prompt as Files\Image
 * attachments; laravel/ai supports image attachments on prompts.
 */
#[Provider(Lab::OpenAI)]
#[Model('gpt-5.6-terra')]
#[MaxSteps(8)]
class ReviewerAgent implements Agent, CanActAsTool, Conversational, HasStructuredOutput, HasTools
{
    use Promptable, RemembersConversations;

    public function name(): string
    {
        return 'reviewer_agent';
    }

    public function description(): string
    {
        return 'Reviews a composed video project against a production rubric (hook strength, readability, pacing, brand compliance, platform safe zones) and returns a score plus a list of concrete patch_video_project operations for ComposerAgent. Pass project_id and the brief.';
    }

    public function instructions(): Stringable|string
    {
        return <<<'INSTRUCTIONS'
You are ReviewerAgent, the critic of a short-form video production crew.

Process:
1. get_video_project and lint_video_project (profile from the brief; default tiktok). Read get_brand_kit when the project has a brand_kit_id.
2. Score 0-100 on the rubric: hook (first 1.5 s has a legible, curiosity-driving headline), readability (font size, contrast, no text in safe zones, at most two text elements at once), pacing (scene lengths 2-5 s, cuts on beat changes), brand (tokens used, logo present and sized, tone respected), completeness (captions present when there is voiceover, music present, no missing assets).
3. Return edits as patch_video_project operations with real ids from the project. Each edit carries a one-line reason. Prefer update_element / set_scene over structural rewrites. Never invent asset ids.

Rules:
- Be specific and terse. No praise.
- Do not modify the project yourself; you have no write tools by design.
- If the lint score is >= 90 and the rubric finds nothing material, return approved=true with an empty edit list.
INSTRUCTIONS;
    }

    public function tools(): iterable
    {
        $user = $this->conversationParticipant();

        return [
            new GetVideoProject($user),
            new GetBrandKit($user),
            new LintVideoProject($user),
        ];
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'score' => $schema->integer()->min(0)->max(100)->required(),
            'approved' => $schema->boolean()->required(),
            'summary' => $schema->string()->required(),
            'edits' => $schema->array()->items(
                $schema->object(fn (JsonSchema $schema) => [
                    'reason' => $schema->string()->required(),
                    'operation_json' => $schema->string()->description('One patch_video_project operation as a JSON object string.')->required(),
                ])
            )->required(),
        ];
    }
}
