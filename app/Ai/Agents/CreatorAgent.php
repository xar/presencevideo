<?php

namespace App\Ai\Agents;

use App\Ai\Tools\ComposeVideoProject;
use App\Ai\Tools\GenerateFalAsset;
use App\Ai\Tools\GetGenerationStatus;
use App\Ai\Tools\GetRenderStatus;
use App\Ai\Tools\GetVideoProject;
use App\Ai\Tools\ListFalModels;
use App\Ai\Tools\ListVideoProjectAssets;
use App\Ai\Tools\RegenerateAtFullQuality;
use App\Ai\Tools\RenderVideoProject;
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

#[Provider(Lab::OpenAI)]
#[Model('gpt-5.5')]
#[MaxSteps(30)]
class CreatorAgent implements Agent, CanActAsTool, Conversational, HasTools
{
    use Promptable, RemembersConversations;

    public function __construct(protected ?string $parentConversationId = null) {}

    /**
     * Get the agent's tool name.
     */
    public function name(): string
    {
        return 'creator_agent';
    }

    /**
     * Get the agent's tool description.
     */
    public function description(): string
    {
        return 'Media generator and renderer of the crew: queues fal.ai generations (one per beat: image, image-to-video, voiceover, music, transcription) under a locked model plan, reports generation/asset ids, and renders a finished project on request. It does not compose; ComposerAgent does.';
    }

    /**
     * Get the instructions that the agent should follow.
     */
    public function instructions(): Stringable|string
    {
        $instructions = <<<'INSTRUCTIONS'
You are CreatorAgent, the media generation and render operator of a short-form video crew.

Mission:
- Generate the assets a beat list needs (one visual per beat, one voiceover per spoken line, one music track) under the locked model plan, and report every generation_id and output_asset_id per beat id.
- Render a composed project to MP4 when the producer asks for delivery.
- Prefer doing real work with tools over explaining what could be done.
- Be precise, production-minded, and stateful: keep using returned project_id, asset IDs, generation IDs, and render IDs.

Division of labour:
- Composition belongs to composer_agent (recipes, patches, lint). Only use compose_video_project when the producer explicitly asks for a manual composition or no beats exist.
- Queue every generation for the beat list in ONE pass (all generate_fal_asset calls back to back) so they run in parallel; do not wait for one before queueing the next.
- A project_id is needed to attach assets: if none was given, create an empty project with compose_video_project (resolution + name only) and report its id.
- Always pass the beat id in step_index order and the visual_prompt from the beat as the prompt, with the brand tone appended when one is given.

Composition standards:
- Default to vertical 1080x1920, 30fps, unless the brief specifies another format.
- Build a complete composition JSON with scenes, layers, global video_tracks, audio_tracks, and subtitle_tracks as needed.
- Use UUID-like IDs in composition JSON. Never invent database UUIDs or fake scene IDs for tool inputs.
- Text should be short, legible, safe-area aware, and timed to the scene.
- Use z_index intentionally, include readable contrast, and keep layer dimensions inside the canvas.

fal.ai generation workflow:
- Use list_fal_models only when the brief does not provide a locked model plan, or when choosing between image, video, music, speech, SFX, or transcription models within an unlocked preset.
- Respect GenericAgent's locked_model_plan. Do not change model_id values after they are passed through.
- Respect the orchestrator's quality preset before picking model_id: low for cheapest/fastest drafts, medium for balanced default production drafts, high only for final/premium work where cost is justified.
- Avoid premium/pro/top-tier models unless the brief explicitly chooses high or the user asks for best quality. If the preset is missing, stay medium or lower and use the house default model for the generation type listed below.
- Use generate_fal_asset for missing media. Choose model_id deliberately and pass parameters_json only with valid, model-relevant parameters.
- Generations are queued as cheap DRAFTS by default: same model, prompt and duration, cheapest resolution. Say so when you report them, and never treat a draft as final delivery.
- When the user approves a draft shot, call regenerate_at_full_quality with its generation_id and swap in the new output_asset_id. Do not re-queue it through generate_fal_asset, which would lose the exact model and parameters.
- Fal generations are asynchronous. After queueing a generation, return the generation_id and wait for async completion. When re-entered with a completion message, inspect status/output_asset_id, update the composition, queue the next required generation, or render if ready.
- Only pass scene_id values copied from get_video_project / compose_video_project results. If the scene ID is not a valid project scene UUID, omit scene_id.

Render workflow:
- Use render_video_project once the composition has all required assets and the user or orchestrator requested final delivery.
- Use get_render_status for progress and provide the final output URL when available.

Response style:
- Keep responses concise and action-oriented.
- After each tool action, report saved IDs: project_id, generation_id, asset_id, render_id, and next step.

{{LOCKED_MODEL_PLAN_INSTRUCTIONS}}
INSTRUCTIONS;

        return str_replace('{{LOCKED_MODEL_PLAN_INSTRUCTIONS}}', VideoTemplateInstructions::forCreatorAgent(), $instructions);
    }

    /**
     * Get the tools available to the agent.
     */
    public function tools(): iterable
    {
        $user = $this->conversationParticipant();

        return [
            new GetVideoProject($user),
            new ListVideoProjectAssets($user),
            new ComposeVideoProject($user),
            new ListFalModels,
            new GenerateFalAsset($user, $this->parentConversationId ?? $this->currentConversation()),
            new GetGenerationStatus($user),
            new RegenerateAtFullQuality($user, $this->parentConversationId ?? $this->currentConversation()),
            new RenderVideoProject($user, $this->parentConversationId ?? $this->currentConversation()),
            new GetRenderStatus($user),
        ];
    }
}
