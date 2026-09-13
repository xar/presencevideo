<?php

namespace App\Events;

use App\Models\AgentActivity;
use App\Support\QuietBroadcast;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Activity progress pushed to the chat UI.
 *
 * This stays a "broadcast now" event on purpose: it is dispatched from inside
 * long-running queued work, so deferring it to the queue would hold it behind
 * the very job that produced it. Because a transport failure would then bubble
 * into that job, always dispatch it through {@see self::dispatchQuietly()}.
 */
class AgentActivityUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public AgentActivity $activity) {}

    /**
     * Dispatch the event without allowing a broadcaster outage to fail the caller.
     *
     * The activity is already persisted, so a dropped broadcast is recovered
     * when the client next reconciles.
     */
    public static function dispatchQuietly(AgentActivity $activity): void
    {
        QuietBroadcast::attempt(
            fn () => static::dispatch($activity),
            'agent.activity.'.$activity->getKey(),
        );
    }

    /**
     * Get the channels the event should broadcast on.
     *
     * @return array<int, Channel>
     */
    public function broadcastOn(): array
    {
        return [
            new PrivateChannel("agent.chat.{$this->activity->user_id}.{$this->activity->conversation_id}"),
        ];
    }

    public function broadcastAs(): string
    {
        return 'activity_updated';
    }

    /**
     * Get the data to broadcast.
     *
     * @return array<string, mixed>
     */
    public function broadcastWith(): array
    {
        return [
            'type' => 'activity_updated',
            'activity' => [
                'id' => (string) $this->activity->id,
                'name' => $this->activity->name,
                'status' => $this->activity->status,
                'result' => $this->activity->payload,
                'successful' => $this->activity->status !== 'failed',
                'error' => $this->activity->payload['error_message'] ?? null,
                'timestamp' => $this->activity->created_at?->timestamp,
            ],
        ];
    }
}
