<?php

namespace App\Ai\Agents;

use App\Ai\VideoTemplateInstructions;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Attributes\MaxSteps;
use Laravel\Ai\Attributes\Model;
use Laravel\Ai\Attributes\Provider;
use Laravel\Ai\Concerns\RemembersConversations;
use Laravel\Ai\Contracts\Agent;
use Laravel\Ai\Contracts\CanActAsTool;
use Laravel\Ai\Contracts\HasStructuredOutput;
use Laravel\Ai\Enums\Lab;
use Laravel\Ai\Promptable;
use Stringable;

/**
 * Turns a brief into timed beats: the input every recipe consumes.
 *
 * No tools on purpose. The script is the one stage that should be cheap to
 * re-run alone, and a typed output is what lets the producer hand it straight
 * to CreatorAgent (assets per beat) and ComposerAgent (apply_video_recipe).
 */
#[Provider(Lab::OpenAI)]
#[Model('gpt-5.5')]
#[MaxSteps(4)]
class ScriptAgent implements Agent, CanActAsTool, HasStructuredOutput
{
    use Promptable, RemembersConversations;

    public function name(): string
    {
        return 'script_agent';
    }

    public function description(): string
    {
        return 'Writes a short-form video script as timed beats (hook, body, cta) with on-screen headlines, voiceover lines, per-beat durations and a visual prompt per beat, in the brand\'s tone of voice. Pass the full brief: goal, audience, platform, duration, template/recipe, brand tone, must-say lines.';
    }

    public function instructions(): Stringable|string
    {
        $instructions = <<<'INSTRUCTIONS'
You are ScriptAgent, a short-form video scriptwriter for TikTok, Reels and Shorts.

Output contract:
- Return ONLY the structured beats object. Each beat: id (b1, b2, …), kind (hook | body | cta), headline (on-screen text, max 6 words, high contrast, no hashtags), sub (optional one-line support text), voiceover (spoken line, conversational, max ~14 words), duration_ms, visual_prompt (one sentence describing the image/video to generate for the beat, matching the brand tone), asset_type (image or video).
- Exactly one hook first and one cta last. Two to five body beats between them.
- Timing: hook 1500–2500 ms, body 2500–4500 ms, cta 2500–4000 ms. Total must fit the requested duration (default 20–30 s, never above 60 s).
- Hook rules: name the viewer's problem or a surprising claim in the first line; never start with "In this video".
- CTA rules: one concrete action; keep the brand's offer wording if given.
- Match the brand tone of voice when one is provided; otherwise plain, energetic, second person.

Self-critique before answering:
- Write two candidate hooks, pick the stronger one (curiosity or contrast), and put only the winner in the output.
- Read every headline back at 1080x1920: if it would not be legible in under a second, shorten it.
- Sum the durations and adjust so the total fits the brief.

{{VIDEO_TEMPLATE_INSTRUCTIONS}}
INSTRUCTIONS;

        return str_replace('{{VIDEO_TEMPLATE_INSTRUCTIONS}}', VideoTemplateInstructions::forScriptAgent(), $instructions);
    }

    /**
     * Get the agent's structured output schema definition.
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'title' => $schema->string()->required(),
            'total_duration_ms' => $schema->integer()->required(),
            'beats' => $schema->array()->items(
                $schema->object(fn (JsonSchema $schema) => [
                    'id' => $schema->string()->required(),
                    'kind' => $schema->string()->enum(['hook', 'body', 'cta'])->required(),
                    'headline' => $schema->string()->required(),
                    'sub' => $schema->string()->nullable(),
                    'voiceover' => $schema->string()->nullable(),
                    'duration_ms' => $schema->integer()->required(),
                    'visual_prompt' => $schema->string()->required(),
                    'asset_type' => $schema->string()->enum(['image', 'video'])->required(),
                ])
            )->min(3)->required(),
        ];
    }
}
