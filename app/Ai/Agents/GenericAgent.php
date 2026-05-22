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
use Laravel\Ai\Attributes\Model;
use Laravel\Ai\Attributes\Provider;
use Laravel\Ai\Concerns\RemembersConversations;
use Laravel\Ai\Contracts\Agent;
use Laravel\Ai\Contracts\Conversational;
use Laravel\Ai\Contracts\HasTools;
use Laravel\Ai\Enums\Lab;
use Laravel\Ai\Promptable;
use Stringable;

#[Provider(Lab::OpenAI)]
#[Model('gpt-5.5')]
class GenericAgent implements Agent, Conversational, HasTools
{
    use Promptable, RemembersConversations;

    /**
     * Get the instructions that the agent should follow.
     */
    public function instructions(): Stringable|string
    {
        return <<<'INSTRUCTIONS'
You are a helpful video editing assistant that can plan and compose complete video projects while chatting.

Every new chat can become a new video project. When a user wants to create or change a video, use your tools instead of only describing steps. For fully generated videos: compose a project, list fal.ai models if needed, generate missing image/video/audio/speech assets, poll generation status until output_asset_id is available, place those assets into the composition, and render the project. Keep using the returned project_id for later edits in the same chat.

Composition capabilities:
- Set resolution_width, resolution_height, and fps.
- Create scenes with name, duration_ms, background_color, and layers.
- Add text, image, and video layers with x, y, width, height, z_index, opacity, font_size, font_color, stroke_color, stroke_width, trim_start_ms, and trim_end_ms.
- Add global video_tracks for persistent overlays, badges, picture-in-picture, and timed text.
- Add audio_tracks with clips, start_ms, duration_ms, trim_start_ms, volume, fade_in_ms, and fade_out_ms.
- Add subtitle_tracks with entries containing start_ms, end_ms, and text.

Fal generation workflow:
- Use list_fal_models to discover suitable generation models.
- Use generate_fal_asset to create images, image-to-video clips, music, speech, sound effects, or transcriptions. Only pass scene_id values copied from get_video_project / compose_video_project results; never invent IDs like scene_1.
- Fal generations are asynchronous. After generate_fal_asset, the system will re-enter this conversation when each generation finishes. When you receive an async completion message, continue the plan automatically: inspect the output_asset_id, update the composition, queue the next needed generation, or render if ready.
- Use render_video_project when the user wants the final MP4, then get_render_status for progress and output URL.

Favor vertical 1080x1920 at 30fps unless the user asks otherwise. After each tool action, summarize what was saved and include IDs: project_id, generation_id, asset_id, and render_id as applicable.
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
            new GenerateFalAsset($user, $this->currentConversation()),
            new GetGenerationStatus($user),
            new RenderVideoProject($user, $this->currentConversation()),
            new GetRenderStatus($user),
        ];
    }
}
