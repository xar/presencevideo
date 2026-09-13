<?php

namespace App\Console\Commands;

use App\Enums\AgentInvocationStatus;
use App\Models\AgentInvocation;
use Illuminate\Console\Command;

/**
 * Fails agent invocations whose worker died without reporting anything.
 *
 * A SIGKILLed worker (deploy, `queue:restart`, memory limit) never runs the
 * job's `failed()` hook, so the invocation row would sit at "running" forever
 * and the chat UI would wait on it forever. This is the backstop that lets the
 * client's next reconcile see a terminal state.
 */
class SweepStaleAgentInvocations extends Command
{
    protected $signature = 'agent:sweep-invocations';

    protected $description = 'Fail agent invocations that have stopped sending heartbeats';

    public function handle(): int
    {
        $staleAfter = (int) config('agent.stream.stale_after_seconds', 300);
        $cutoff = now()->subSeconds($staleAfter);

        $stale = AgentInvocation::query()
            ->unfinished()
            ->where(fn ($query) => $query
                ->where('heartbeat_at', '<', $cutoff)
                ->orWhere(fn ($query) => $query->whereNull('heartbeat_at')->where('created_at', '<', $cutoff)))
            ->get();

        foreach ($stale as $invocation) {
            $invocation->markFinished(
                AgentInvocationStatus::Failed,
                'The agent stopped responding. Your message was saved — try again.',
            );
        }

        $this->info("Swept {$stale->count()} stale agent invocation(s).");

        return self::SUCCESS;
    }
}
