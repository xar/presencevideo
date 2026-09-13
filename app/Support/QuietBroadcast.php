<?php

namespace App\Support;

use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Broadcasts that must never take the work down with them.
 *
 * Everything broadcast from the agent pipeline is also persisted, and clients
 * reconcile against that persisted state. A broadcaster outage therefore costs
 * latency, never correctness — so it must not be allowed to fail a queued job
 * mid-run, which would abandon a conversation the user is waiting on.
 */
class QuietBroadcast
{
    /**
     * Attempt a broadcast, swallowing and logging any transport failure.
     */
    public static function attempt(callable $broadcast, string $context): bool
    {
        try {
            $broadcast();

            return true;
        } catch (Throwable $e) {
            Log::warning('Broadcast failed; clients will recover by reconciling.', [
                'context' => $context,
                'exception' => $e->getMessage(),
            ]);

            return false;
        }
    }
}
