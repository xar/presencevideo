<?php

namespace App\Jobs;

use App\Ai\Agents\GenericAgent;
use App\Enums\AgentInvocationStatus;
use App\Models\AgentInvocation;
use App\Support\QuietBroadcast;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Broadcast;
use Laravel\Ai\Streaming\Events\StreamEvent;
use Laravel\Ai\Streaming\Events\TextDelta;
use Throwable;

/**
 * Runs one agent invocation, persisting its output as it streams.
 *
 * This replaces Laravel AI's own BroadcastAgent job. The difference that
 * matters: every event is written to the invocation row *before* it is
 * broadcast, and the broadcast itself cannot fail the run. A client that never
 * receives an event — because it had not finished subscribing, or its socket
 * dropped — recovers the identical state by reading the row back.
 */
class RunAgentInvocation implements ShouldQueue
{
    use Queueable;

    /**
     * Agent runs are never retried.
     *
     * The producer agent dispatches billable, externally visible side effects
     * (fal.ai generations, renders). Replaying a partially completed run would
     * duplicate them. A run killed mid-flight is instead surfaced to the user
     * by the stale sweeper, which marks it failed so the client can unstick.
     */
    public int $tries = 1;

    /**
     * Wall-clock budget for one agent run, in seconds.
     *
     * Held below the worker's `--timeout` (QUEUE_TIMEOUT) so the job's own
     * timeout fires first and `failed()` gets a chance to mark the invocation,
     * rather than the worker SIGKILLing the process with the row still
     * "running". The connection's `retry_after` must exceed this in turn, or
     * the broker hands a live agent run to a second worker. A test pins both
     * relationships.
     */
    public int $timeout = 840;

    /**
     * The full assistant text produced so far.
     */
    protected string $text = '';

    protected int $seq = 0;

    protected float $lastFlushedAt = 0.0;

    public function __construct(public string $invocationId)
    {
        $this->onQueue('agents');
    }

    /**
     * Execute the job.
     */
    public function handle(): void
    {
        $invocation = AgentInvocation::find($this->invocationId);

        if ($invocation === null || $invocation->isTerminal()) {
            return;
        }

        $invocation->forceFill([
            'status' => AgentInvocationStatus::Running,
            'heartbeat_at' => now(),
        ])->save();

        $this->text = $invocation->partial_text ?? '';
        $this->seq = $invocation->last_seq;
        $this->lastFlushedAt = microtime(true);

        $channel = new PrivateChannel($this->channelName($invocation));

        (new GenericAgent)
            ->continue($invocation->conversation_id, as: $invocation->user)
            ->stream($invocation->prompt)
            ->each(function (StreamEvent $event) use ($invocation, $channel): void {
                $this->handleEvent($invocation, $channel, $event);
            });

        $this->flush($invocation, force: true);
        $invocation->markFinished(AgentInvocationStatus::Completed);

        $this->broadcastState($invocation, $channel);
    }

    /**
     * Persist a single stream event, then push it to any listening clients.
     */
    protected function handleEvent(AgentInvocation $invocation, PrivateChannel $channel, StreamEvent $event): void
    {
        $this->seq++;

        if ($event instanceof TextDelta) {
            $this->text .= $event->delta;

            $this->flush($invocation);
        } else {
            // Discrete events (tool calls, results, stream end) are rare and
            // meaningful, so they always checkpoint immediately.
            $this->flush($invocation, force: true);
        }

        // array_merge, not "+": the event carries its own null invocation_id and
        // the union operator would keep it, leaving clients unable to tell whose
        // run an event belongs to.
        $payload = array_merge($event->toArray(), [
            'invocation_id' => $invocation->id,
            'seq' => $this->seq,
        ]);

        QuietBroadcast::attempt(
            fn () => Broadcast::on($channel)->as($event->type())->with($payload)->sendNow(),
            'agent.invocation.'.$invocation->id,
        );
    }

    /**
     * Write accumulated text and the current sequence to the invocation row.
     */
    protected function flush(AgentInvocation $invocation, bool $force = false): void
    {
        $intervalMs = (int) config('agent.stream.flush_interval_ms', 250);
        $elapsedMs = (microtime(true) - $this->lastFlushedAt) * 1000;

        if (! $force && $elapsedMs < $intervalMs) {
            return;
        }

        $this->lastFlushedAt = microtime(true);

        $invocation->forceFill([
            'partial_text' => $this->text,
            'last_seq' => $this->seq,
            'heartbeat_at' => now(),
        ])->save();
    }

    /**
     * Push the authoritative invocation state to listening clients.
     */
    protected function broadcastState(AgentInvocation $invocation, PrivateChannel $channel): void
    {
        QuietBroadcast::attempt(
            fn () => Broadcast::on($channel)
                ->as('invocation_state')
                ->with(['type' => 'invocation_state', 'invocation' => $invocation->fresh()->toClientState()])
                ->sendNow(),
            'agent.invocation.'.$invocation->id,
        );
    }

    /**
     * Handle a job failure.
     */
    public function failed(Throwable $exception): void
    {
        $invocation = AgentInvocation::find($this->invocationId);

        if ($invocation === null || $invocation->isTerminal()) {
            return;
        }

        $invocation->markFinished(
            AgentInvocationStatus::Failed,
            'The agent stopped unexpectedly. Your message was saved — try again.',
        );

        $this->broadcastState($invocation, new PrivateChannel($this->channelName($invocation)));
    }

    /**
     * Get the private channel name carrying this invocation's events.
     */
    protected function channelName(AgentInvocation $invocation): string
    {
        return "agent.chat.{$invocation->user_id}.{$invocation->conversation_id}";
    }
}
