<?php

/**
 * The production container's queue worker is configuration, not code, so
 * nothing else fails when it goes missing: jobs are dispatched, sit in Redis
 * forever, and no error is logged anywhere. That has happened once already,
 * when the compose file carrying the worker service was deleted and the
 * Dockerfile-only deploy was left with no worker at all.
 */
it('starts a queue worker inside the app container', function () {
    $supervisord = file_get_contents(base_path('docker/supervisord.conf'));

    expect($supervisord)->toContain('[program:queue]')
        ->and($supervisord)->toContain('[program:scheduler]')
        ->and($supervisord)->toContain('services.sh queue')
        ->and($supervisord)->toContain('services.sh scheduler');
});

it('defines the worker command in exactly one place', function () {
    $entrypoint = file_get_contents(base_path('docker/entrypoint.sh'));
    $supervisord = file_get_contents(base_path('docker/supervisord.conf'));

    // Both paths must call docker/services.sh. A second copy of the command
    // line is how one of them ends up missing a queue.
    // Both paths must call docker/services.sh. A second copy of the --queue
    // list is how one of them ends up missing a queue.
    // (The `worker` escape-hatch mode's WORKER_COMMAND is deliberately exempt.)
    expect($entrypoint)->not->toContain('--queue=')
        ->and($supervisord)->not->toContain('--queue=')
        ->and($entrypoint)->toContain('start_queue')
        ->and($supervisord)->toContain('services.sh queue');
});

it('processes every queue the application dispatches to', function () {
    $services = file_get_contents(base_path('docker/services.sh'));
    $env = file_get_contents(base_path('.env.docker.example'));

    preg_match('/QUEUE_NAME:-([a-z,]+)/', $services, $default);
    preg_match('/^QUEUE_NAME=([a-z,]+)$/m', $env, $configured);

    // `agents` carries RunAgentInvocation (chat) and `renders` RenderProject.
    // Drop either from the worker's --queue list and that feature silently
    // never completes.
    foreach (['default', 'agents', 'renders', 'generations'] as $queue) {
        expect(explode(',', $default[1]))->toContain($queue)
            ->and(explode(',', $configured[1]))->toContain($queue);
    }
});

it('always defines the supervisord service toggles in the image', function () {
    $dockerfile = file_get_contents(base_path('Dockerfile'));

    // supervisord reads these as %(ENV_RUN_*)s and refuses to start the whole
    // config, web server included, if one is undefined at runtime.
    foreach (['RUN_QUEUE', 'RUN_SCHEDULER', 'RUN_REVERB'] as $toggle) {
        expect($dockerfile)->toMatch('/^ENV '.$toggle.'=\w+$/m');
    }
});
