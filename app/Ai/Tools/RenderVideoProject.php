<?php

namespace App\Ai\Tools;

use App\Enums\RenderStatus;
use App\Events\AgentActivityUpdated;
use App\Jobs\RenderProject;
use App\Models\AgentActivity;
use App\Models\Project;
use App\Models\Render;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

class RenderVideoProject implements Tool
{
    public function __construct(
        protected ?object $user = null,
        protected ?string $conversationId = null,
    ) {}

    public function name(): string
    {
        return 'render_video_project';
    }

    public function description(): Stringable|string
    {
        return 'Queue rendering of a composed video project to MP4. Use after the project has scenes and all referenced generated assets are complete.';
    }

    public function handle(Request $request): Stringable|string
    {
        $project = Project::query()
            ->whereKey($request['project_id'])
            ->when($this->user?->id !== null, fn ($query) => $query->where('user_id', $this->user->id))
            ->firstOrFail();

        $render = Render::create([
            'project_id' => $project->id,
            'user_id' => $this->user?->id ?? $project->user_id,
            'status' => RenderStatus::Queued,
            'progress' => 0,
        ]);

        $activity = $this->createActivity($project, $render);

        RenderProject::dispatch($render);

        return json_encode([
            'render_id' => $render->id,
            'activity_id' => $activity?->id,
            'project_id' => $project->id,
            'status' => $render->status->value,
            'message' => 'Render queued.',
        ], JSON_THROW_ON_ERROR);
    }

    protected function createActivity(Project $project, Render $render): ?AgentActivity
    {
        if ($this->conversationId === null) {
            return null;
        }

        $activity = AgentActivity::create([
            'conversation_id' => $this->conversationId,
            'user_id' => $this->user?->id ?? $project->user_id,
            'type' => 'render',
            'name' => 'render_video_project',
            'status' => 'running',
            'payload' => [
                'project_id' => $project->id,
                'render_id' => $render->id,
                'message' => 'Video render queued.',
            ],
            'started_at' => now(),
        ]);

        AgentActivityUpdated::dispatch($activity);

        return $activity;
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'project_id' => $schema->integer()->required(),
        ];
    }
}
