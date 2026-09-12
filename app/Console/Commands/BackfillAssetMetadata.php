<?php

namespace App\Console\Commands;

use App\Enums\AssetType;
use App\Jobs\ProcessAssetUpload;
use App\Models\Asset;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Builder;

class BackfillAssetMetadata extends Command
{
    protected $signature = 'assets:backfill-metadata
        {--all : Re-probe every asset, not only the incomplete ones}
        {--project= : Limit to a single project}';

    protected $description = 'Probe assets that are missing a duration, dimensions or a thumbnail';

    public function handle(): int
    {
        $query = Asset::query()
            ->when($this->option('project'), fn (Builder $q, $projectId) => $q->where('project_id', $projectId))
            ->unless($this->option('all'), fn (Builder $q) => $q->where(fn (Builder $incomplete) => $incomplete
                ->whereNull('duration_ms')
                ->orWhereNull('width')
                ->orWhere(fn (Builder $video) => $video
                    ->where('type', AssetType::Video)
                    ->whereNull('thumbnail_path'))
            ));

        $count = 0;

        $query->each(function (Asset $asset) use (&$count): void {
            // Images have no duration by nature, so they would match the
            // incomplete filter forever once probed.
            if ($asset->type === AssetType::Image && $asset->width !== null) {
                return;
            }

            ProcessAssetUpload::dispatch($asset);
            $count++;
        });

        $this->info("Queued {$count} asset(s) for metadata probing.");

        return self::SUCCESS;
    }
}
