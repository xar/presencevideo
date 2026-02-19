<?php

namespace App\Models;

use App\Enums\RenderStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

class Render extends Model
{
    /** @use HasFactory<\Database\Factories\RenderFactory> */
    use HasFactory;

    protected $fillable = [
        'project_id',
        'user_id',
        'status',
        'progress',
        'output_path',
        'output_asset_id',
        'error_message',
        'started_at',
        'completed_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'status' => RenderStatus::class,
            'progress' => 'integer',
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<Project, $this>
     */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return BelongsTo<Asset, $this>
     */
    public function outputAsset(): BelongsTo
    {
        return $this->belongsTo(Asset::class, 'output_asset_id');
    }

    public function getOutputUrlAttribute(): ?string
    {
        if (! $this->output_path) {
            return null;
        }

        return Storage::url($this->output_path);
    }

    public function isComplete(): bool
    {
        return $this->status === RenderStatus::Completed;
    }

    public function isFailed(): bool
    {
        return $this->status === RenderStatus::Failed;
    }

    public function isProcessing(): bool
    {
        return in_array($this->status, [
            RenderStatus::Processing,
            RenderStatus::Compositing,
            RenderStatus::Mixing,
        ], true);
    }
}
