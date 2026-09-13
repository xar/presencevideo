<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Brand kit intake
    |--------------------------------------------------------------------------
    |
    | An intake token is a capability an outside LLM agent uses to fill in ONE
    | brand kit: it names the kit it may write, expires on its own, and grants
    | nothing else. These are the limits that capability runs under.
    |
    */

    'token_ttl_days' => (int) env('BRAND_INTAKE_TOKEN_TTL_DAYS', 7),

    /** Largest file the intake endpoint will fetch from a caller-supplied URL. */
    'max_asset_bytes' => (int) env('BRAND_INTAKE_MAX_ASSET_BYTES', 25 * 1024 * 1024),

    /** Seconds to wait when fetching a caller-supplied asset URL. */
    'fetch_timeout' => (int) env('BRAND_INTAKE_FETCH_TIMEOUT', 20),

    /**
     * Whether a caller-supplied URL may resolve to a private or reserved
     * address. Off everywhere but local testing: the endpoint is public, so a
     * permitted private host turns it into an SSRF probe of our own network.
     */
    'allow_private_hosts' => (bool) env('BRAND_INTAKE_ALLOW_PRIVATE_HOSTS', false),

];
