<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Agent Stream Durability
    |--------------------------------------------------------------------------
    |
    | The browser receives agent output over Reverb, but the websocket is only
    | a latency optimisation: the "agent_invocations" row is the source of
    | truth. These options tune how often that row is written and how long a
    | silent invocation may sit before it is swept into a failed state.
    |
    */

    'stream' => [

        /*
         * How often, in milliseconds, accumulated text deltas are flushed to
         * the invocation row. Discrete events (tool calls, results, stream end)
         * always force a flush regardless of this interval.
         */
        'flush_interval_ms' => (int) env('AGENT_STREAM_FLUSH_INTERVAL_MS', 250),

        /*
         * How long, in seconds, an unfinished invocation may go without a
         * heartbeat before the sweeper marks it as failed. This is what
         * unsticks a client when a queue worker is killed mid-run.
         */
        'stale_after_seconds' => (int) env('AGENT_STREAM_STALE_AFTER_SECONDS', 300),

        /*
         * How long, in seconds, the browser waits without receiving any event
         * for a running invocation before it reconciles against the server.
         */
        'client_watchdog_seconds' => (int) env('AGENT_STREAM_CLIENT_WATCHDOG_SECONDS', 20),
    ],

];
