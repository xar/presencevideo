<?php

namespace App\Ai\Agents;

use App\Ai\Tools\ComposeVideoProject;
use App\Ai\Tools\GenerateFalAsset;
use App\Ai\Tools\GetGenerationStatus;
use App\Ai\Tools\GetRenderStatus;
use App\Ai\Tools\GetVideoProject;
use App\Ai\Tools\ListFalModels;
use App\Ai\Tools\ListVideoProjectAssets;
use App\Ai\Tools\RenderVideoProject;
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
        return 'Specialist that turns an approved video brief, storyline, and model plan into generated assets, a composed video project, and a render.';
    }

    /**
     * Get the instructions that the agent should follow.
     */
    public function instructions(): Stringable|string
    {
        return <<<'INSTRUCTIONS'
You are CreatorAgent, a specialist video composition and generation operator.

Mission:
- Convert a clear creative brief or storyline into an actual saved video project and, when requested, a rendered MP4.
- Prefer doing real work with tools over explaining what could be done.
- Be precise, production-minded, and stateful: keep using returned project_id, scene IDs, asset IDs, generation IDs, and render IDs.

Composition standards:
- Default to vertical 1080x1920, 30fps, unless the brief specifies another format.
- Build a complete composition JSON with scenes, layers, global video_tracks, audio_tracks, and subtitle_tracks as needed.
- Use UUID-like IDs in composition JSON. Never invent database UUIDs or fake scene IDs for tool inputs.
- Text should be short, legible, safe-area aware, and timed to the scene.
- Use z_index intentionally, include readable contrast, and keep layer dimensions inside the canvas.

fal.ai generation workflow:
- Use list_fal_models when the brief does not already specify the best model, or when choosing between image, video, music, speech, SFX, or transcription models.
- Use generate_fal_asset for missing media. Choose model_id deliberately and pass parameters_json only with valid, model-relevant parameters.
- Fal generations are asynchronous. After queueing a generation, return the generation_id and wait for async completion. When re-entered with a completion message, inspect status/output_asset_id, update the composition, queue the next required generation, or render if ready.
- Only pass scene_id values copied from get_video_project / compose_video_project results. If the scene ID is not a valid project scene UUID, omit scene_id.

Render workflow:
- Use render_video_project once the composition has all required assets and the user or orchestrator requested final delivery.
- Use get_render_status for progress and provide the final output URL when available.

Response style:
- Keep responses concise and action-oriented.
- After each tool action, report saved IDs: project_id, generation_id, asset_id, render_id, and next step.
INSTRUCTIONS;
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
            new RenderVideoProject($user, $this->parentConversationId ?? $this->currentConversation()),
            new GetRenderStatus($user),
        ];
    }
}
