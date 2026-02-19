<?php

namespace App\Models;

use App\Enums\GenerationStatus;
use App\Enums\GenerationType;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Generation extends Model
{
    /** @use HasFactory<\Database\Factories\GenerationFactory> */
    use HasFactory;

    protected $fillable = [
        'user_id',
        'project_id',
        'scene_id',
        'step_index',
        'type',
        'provider',
        'model',
        'prompt',
        'input_asset_id',
        'output_asset_id',
        'parameters',
        'status',
        'error_message',
        'fal_request_id',
        'alternatives',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'step_index' => 'integer',
            'type' => GenerationType::class,
            'parameters' => 'array',
            'status' => GenerationStatus::class,
            'alternatives' => 'array',
        ];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return BelongsTo<Project, $this>
     */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /**
     * @return BelongsTo<Asset, $this>
     */
    public function inputAsset(): BelongsTo
    {
        return $this->belongsTo(Asset::class, 'input_asset_id');
    }

    /**
     * @return BelongsTo<Asset, $this>
     */
    public function outputAsset(): BelongsTo
    {
        return $this->belongsTo(Asset::class, 'output_asset_id');
    }

    public function isComplete(): bool
    {
        return $this->status === GenerationStatus::Completed;
    }

    public function isFailed(): bool
    {
        return $this->status === GenerationStatus::Failed;
    }

    public function isPending(): bool
    {
        return $this->status === GenerationStatus::Pending;
    }

    public function isProcessing(): bool
    {
        return $this->status === GenerationStatus::Processing;
    }
}
