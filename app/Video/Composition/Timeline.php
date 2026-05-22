<?php

namespace App\Video\Composition;

use App\Models\Project;

class Timeline
{
    public static function seconds(float $seconds): int
    {
        return (int) round($seconds * 1000);
    }

    public static function totalDuration(Project $project): int
    {
        return array_sum(array_map(fn (array $scene): int => (int) ($scene['duration_ms'] ?? 0), $project->scenes ?? []));
    }

    public static function sceneStart(Project $project, string $sceneId): int
    {
        $start = 0;

        foreach ($project->scenes ?? [] as $scene) {
            if (($scene['id'] ?? null) === $sceneId) {
                return $start;
            }

            $start += (int) ($scene['duration_ms'] ?? 0);
        }

        return $start;
    }

    public static function sceneRelativeToProject(Project $project, string $sceneId, int $relativeMs): int
    {
        return self::sceneStart($project, $sceneId) + $relativeMs;
    }
}
