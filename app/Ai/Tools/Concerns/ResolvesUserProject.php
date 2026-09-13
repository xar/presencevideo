<?php

namespace App\Ai\Tools\Concerns;

use App\Models\Project;

/**
 * Shared project lookup for agent tools: a project is only reachable by the
 * user the tool was built for. The same guard used to be copied into every
 * tool's handle().
 */
trait ResolvesUserProject
{
    protected function userProject(mixed $projectId): Project
    {
        return Project::query()
            ->whereKey($projectId)
            ->when($this->user?->id !== null, fn ($query) => $query->where('user_id', $this->user->id))
            ->firstOrFail();
    }
}
