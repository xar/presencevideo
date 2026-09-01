<?php

use App\Models\Project;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Scene layers and overlay clips now share one element model. Re-save
     * every project through the model accessors so stored JSON carries the
     * defaults the editor and renderer assume (`type`, text/shape fields,
     * nested lists), instead of relying on read-time normalisation forever.
     */
    public function up(): void
    {
        Project::query()->each(function (Project $project): void {
            $project->forceFill([
                'scenes' => $project->scenes,
                'video_tracks' => $project->video_tracks,
            ])->saveQuietly();
        });
    }

    public function down(): void
    {
        // The backfill only adds defaults; nothing to undo.
    }
};
