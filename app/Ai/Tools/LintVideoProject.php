<?php

namespace App\Ai\Tools;

use App\Ai\Tools\Concerns\ResolvesUserProject;
use App\Services\ModelCliService;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

class LintVideoProject implements Tool
{
    use ResolvesUserProject;

    public function __construct(protected ?object $user = null, protected ?ModelCliService $cli = null) {}

    public function name(): string
    {
        return 'lint_video_project';
    }

    public function description(): Stringable|string
    {
        return 'Check a video project against a platform profile (tiktok, reels, shorts, generic): safe zones, text size, contrast, hook, pacing, duration, captions, missing assets and brand compliance. Returns a score 0-100 and a list of issues with element/scene ids and a suggested fix. Fix issues with patch_video_project and lint again.';
    }

    public function handle(Request $request): Stringable|string
    {
        $project = $this->userProject($request['project_id']);
        $cli = $this->cli ?? app(ModelCliService::class);

        $report = $cli->lint(ModelCliService::projectPayload($project), (string) ($request['profile'] ?? 'tiktok'));

        return json_encode(['project_id' => $project->id, 'lint' => $report], JSON_THROW_ON_ERROR);
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'project_id' => $schema->integer()->required(),
            'profile' => $schema->string(),
        ];
    }
}
