#!/bin/bash
# =============================================================================
# Long-running background services (queue, scheduler, reverb)
#
# ONE definition of how each service is started. It is used from two places:
#   - docker/entrypoint.sh, when the container runs a single dedicated role
#     (CONTAINER_MODE=queue|scheduler|reverb), i.e. a multi-container deploy
#   - docker/supervisord.conf, when the `app` container runs everything itself
#     (single-container deploy, e.g. one Coolify service built from Dockerfile)
#
# Never fork a second copy of these command lines: a worker started without
# `agents` in --queue makes chat silently never answer, and one started without
# `renders` makes exports hang forever, with no error anywhere.
# =============================================================================
set -e

start_queue() {
    # Deliberately NOT defaulted to "redis". The app dispatches on
    # config('queue.default'), which falls back to "database" -- a worker
    # hardcoded to redis would poll a broker nothing is writing to, and the jobs
    # would queue up invisibly. Unset means "whatever the app dispatches on".
    QUEUE_NAME=${QUEUE_NAME:-default,agents,renders,generations}
    QUEUE_TIMEOUT=${QUEUE_TIMEOUT:-900}
    QUEUE_TRIES=${QUEUE_TRIES:-3}
    QUEUE_MAX_JOBS=${QUEUE_MAX_JOBS:-1000}
    QUEUE_MEMORY=${QUEUE_MEMORY:-128}

    # Printed so a misconfigured worker is obvious in `docker logs` rather than
    # presenting as a queue that silently never runs.
    echo "[queue] ${QUEUE_NAME} (connection=${QUEUE_CONNECTION:-<app default>}, timeout=${QUEUE_TIMEOUT}s, tries=${QUEUE_TRIES}, memory=${QUEUE_MEMORY}M)"

    exec php artisan queue:work ${QUEUE_CONNECTION:+"$QUEUE_CONNECTION"} \
        --queue="$QUEUE_NAME" \
        --timeout="$QUEUE_TIMEOUT" \
        --tries="$QUEUE_TRIES" \
        --max-jobs="$QUEUE_MAX_JOBS" \
        --memory="$QUEUE_MEMORY" \
        --sleep=3 \
        --verbose
}

start_scheduler() {
    # Load-bearing for chat: agent:sweep-invocations is the only thing that
    # unsticks a client whose worker was killed mid-run (a killed worker never
    # runs failed()).
    echo "[scheduler] schedule:work"
    exec php artisan schedule:work --no-interaction
}

start_reverb() {
    REVERB_SERVER_HOST=${REVERB_SERVER_HOST:-0.0.0.0}
    REVERB_SERVER_PORT=${REVERB_SERVER_PORT:-8080}

    echo "[reverb] ${REVERB_SERVER_HOST}:${REVERB_SERVER_PORT}"
    exec php artisan reverb:start \
        --host="$REVERB_SERVER_HOST" \
        --port="$REVERB_SERVER_PORT" \
        --verbose
}

# Direct invocation: docker/services.sh <queue|scheduler|reverb>
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    case "$1" in
        queue) start_queue ;;
        scheduler) start_scheduler ;;
        reverb) start_reverb ;;
        *) echo "usage: services.sh <queue|scheduler|reverb>" >&2; exit 1 ;;
    esac
fi
