#!/bin/bash
set -e

# =============================================================================
# Laravel Docker Entrypoint
# Supports multiple container modes: app, queue, scheduler, horizon
# =============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[ENTRYPOINT]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[ENTRYPOINT]${NC} $1"
}

error() {
    echo -e "${RED}[ENTRYPOINT]${NC} $1"
}

# Default values
CONTAINER_MODE=${CONTAINER_MODE:-app}
APP_ENV=${APP_ENV:-production}

log "Starting container in '${CONTAINER_MODE}' mode (APP_ENV=${APP_ENV})"

# -----------------------------------------------------------------------------
# Wait for dependencies (database, redis, etc.)
# -----------------------------------------------------------------------------
wait_for_service() {
    local host=$1
    local port=$2
    local max_attempts=${3:-30}
    local attempt=1

    if [ -z "$host" ] || [ -z "$port" ]; then
        return 0
    fi

    log "Waiting for $host:$port..."

    while ! nc -z "$host" "$port" 2>/dev/null; do
        if [ $attempt -ge $max_attempts ]; then
            error "Service $host:$port not available after $max_attempts attempts"
            return 1
        fi
        sleep 1
        ((attempt++))
    done

    log "Service $host:$port is available"
}

# Wait for database if DB_HOST is set
if [ -n "$DB_HOST" ] && [ -n "$DB_PORT" ]; then
    wait_for_service "$DB_HOST" "$DB_PORT"
fi

# Wait for Redis if REDIS_HOST is set
if [ -n "$REDIS_HOST" ] && [ -n "$REDIS_PORT" ]; then
    wait_for_service "$REDIS_HOST" "${REDIS_PORT:-6379}"
fi

# -----------------------------------------------------------------------------
# Run Laravel optimizations (only for non-local environments)
# -----------------------------------------------------------------------------
if [ "$APP_ENV" != "local" ]; then
    log "Running Laravel optimizations..."

    # Cache config, routes, and views
    php artisan config:cache || warn "Config cache failed"
    php artisan route:cache || warn "Route cache failed"
    php artisan view:cache || warn "View cache failed"
    php artisan event:cache || warn "Event cache failed"

    log "Optimizations complete"
fi

# Run migrations if AUTO_MIGRATE is set
if [ "${AUTO_MIGRATE:-false}" = "true" ]; then
    log "Running database migrations..."
    php artisan migrate --force || error "Migrations failed"
fi

# -----------------------------------------------------------------------------
# Start the appropriate service based on CONTAINER_MODE
# -----------------------------------------------------------------------------
case "$CONTAINER_MODE" in
    app)
        log "Starting application server..."

        # Option 1: PHP Built-in server (simple, good for small apps)
        # exec php artisan serve --host=0.0.0.0 --port=8000

        # Option 2: PHP-FPM + Supervisor (recommended for production)
        exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
        ;;

    queue)
        log "Starting queue worker..."

        QUEUE_CONNECTION=${QUEUE_CONNECTION:-redis}
        QUEUE_NAME=${QUEUE_NAME:-default}
        QUEUE_TIMEOUT=${QUEUE_TIMEOUT:-60}
        QUEUE_TRIES=${QUEUE_TRIES:-3}
        QUEUE_MAX_JOBS=${QUEUE_MAX_JOBS:-1000}
        QUEUE_MEMORY=${QUEUE_MEMORY:-128}

        exec php artisan queue:work "$QUEUE_CONNECTION" \
            --queue="$QUEUE_NAME" \
            --timeout="$QUEUE_TIMEOUT" \
            --tries="$QUEUE_TRIES" \
            --max-jobs="$QUEUE_MAX_JOBS" \
            --memory="$QUEUE_MEMORY" \
            --sleep=3 \
            --verbose
        ;;

    scheduler)
        log "Starting task scheduler..."

        # Run scheduler in a loop
        while true; do
            php artisan schedule:run --verbose --no-interaction &
            sleep 60
        done
        ;;

    horizon)
        log "Starting Laravel Horizon..."
        exec php artisan horizon
        ;;

    worker)
        log "Starting custom worker..."
        # This allows running a custom command via WORKER_COMMAND env var
        WORKER_COMMAND=${WORKER_COMMAND:-"php artisan queue:work"}
        exec $WORKER_COMMAND
        ;;

    *)
        error "Unknown container mode: $CONTAINER_MODE"
        error "Available modes: app, queue, scheduler, horizon, worker"
        exit 1
        ;;
esac
