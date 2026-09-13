<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Render Driver
    |--------------------------------------------------------------------------
    |
    | Which compositor decides the pixels of a server-side render.
    |
    | "headless" runs the SAME TypeScript pipeline the live preview and the
    | browser export use -- resolveFrame() + drawFrame() -- inside headless
    | Chrome, so a server render and a browser export are identical by
    | construction. It owns audio too: the page mixes the project with
    | planProjectAudio()/renderAudioPlan() and muxes AAC itself, so no ffmpeg
    | audio stage runs on this path.
    |
    | "ffmpeg" is the LEGACY filtergraph renderer. It is a second renderer that
    | structurally cannot express keyframes, so animated elements are missing
    | from its output. It is kept as a fallback until the headless path has
    | proven itself in production.
    |
    */

    'driver' => env('RENDER_DRIVER', 'ffmpeg'),

    'headless' => [

        /*
        | Origin headless Chrome loads the render page from.
        |
        | WebCodecs is gated on a SECURE CONTEXT, so this must be https:// or a
        | http://localhost / http://127.0.0.1 origin. A plain-http LAN hostname
        | silently has no VideoEncoder at all.
        */
        'base_url' => env('RENDER_HEADLESS_BASE_URL', env('APP_URL', 'http://127.0.0.1')),

        'node_binary' => env('RENDER_HEADLESS_NODE', 'node'),

        /*
        | Chrome executable. Null lets Puppeteer use the Chrome for Testing
        | build it downloaded; Docker sets this to the system Chrome instead.
        */
        'chrome_binary' => env('RENDER_HEADLESS_CHROME'),

        /*
        | Local development is served by Herd over a self-signed certificate,
        | which Chrome rejects. Never enable this in production.
        */
        'ignore_certificate_errors' => (bool) env('RENDER_HEADLESS_IGNORE_CERT_ERRORS', false),

        /*
        | Seconds a render access token stays valid. It scopes an unauthenticated
        | Chrome to exactly one project's assets, so it is deliberately short.
        */
        'token_ttl' => (int) env('RENDER_HEADLESS_TOKEN_TTL', 900),

        /*
        | Wall-clock budget for the browser, in seconds. MUST stay below
        | App\Jobs\RenderProject::$timeout so the driver is terminated and its
        | temp files cleaned before the worker SIGKILLs the job. A test pins
        | this relationship.
        */
        'timeout' => (int) env('RENDER_HEADLESS_TIMEOUT', 870),

    ],

    /*
    |--------------------------------------------------------------------------
    | Model CLI
    |--------------------------------------------------------------------------
    |
    | The pure TypeScript model (lint, recipes, brand token resolution) is the
    | single implementation of those rules. PHP agents reach it by running an
    | esbuild bundle under Node instead of porting the rules, so the editor's
    | readiness panel and the agents' lint tool cannot drift apart. Build it
    | with `npm run build:model-cli` (part of `npm run build`).
    |
    */

    'model_cli' => [
        'bundle_path' => env('RENDER_MODEL_CLI_BUNDLE', resource_path('js/headless/dist/model-cli.mjs')),
        'timeout' => (int) env('RENDER_MODEL_CLI_TIMEOUT', 60),
    ],

];
