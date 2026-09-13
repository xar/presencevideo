<?php

namespace App\Models;

use App\Enums\AgentInvocationStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A single durable run of an agent against a conversation.
 *
 * This row — not the WebSocket — is the source of truth for what the agent has
 * produced so far. Broadcasting is a latency optimisation layered on top: a
 * client that misses events reconciles by reading this record back.
 */
class AgentInvocation extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'conversation_id',
        'user_id',
        'status',
        'prompt',
        'partial_text',
        'last_seq',
        'error_message',
        'idempotency_key',
        'heartbeat_at',
        'finished_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'status' => AgentInvocationStatus::class,
            'last_seq' => 'integer',
            'heartbeat_at' => 'datetime',
            'finished_at' => 'datetime',
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
     * Scope the query to invocations that have not reached a terminal state.
     *
     * @param  Builder<$this>  $query
     */
    public function scopeUnfinished(Builder $query): void
    {
        $query->whereIn('status', [
            AgentInvocationStatus::Queued->value,
            AgentInvocationStatus::Running->value,
        ]);
    }

    /**
     * Determine whether the invocation has reached a terminal state.
     */
    public function isTerminal(): bool
    {
        return $this->status->isTerminal();
    }

    /**
     * Mark the invocation as finished with the given status.
     */
    public function markFinished(AgentInvocationStatus $status, ?string $errorMessage = null): void
    {
        $this->forceFill([
            'status' => $status,
            'error_message' => $errorMessage,
            'heartbeat_at' => now(),
            'finished_at' => now(),
        ])->save();
    }

    /**
     * Get the representation of the invocation sent to the browser.
     *
     * Every producer of invocation state — the Inertia page, the reconcile
     * endpoint and the terminal broadcast — uses this one shape so the client
     * never has to reconcile two different payloads.
     *
     * @return array<string, mixed>
     */
    public function toClientState(): array
    {
        return [
            'id' => $this->id,
            'conversation_id' => $this->conversation_id,
            'status' => $this->status->value,
            'prompt' => $this->prompt,
            'partial_text' => $this->partial_text ?? '',
            'last_seq' => $this->last_seq,
            'error' => $this->error_message,
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
