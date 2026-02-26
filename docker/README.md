# Docker Setup for Video Editor

## Quick Start (Local Development)

```bash
# Copy environment file
cp .env.docker.example .env.docker

# Edit .env.docker with your settings (especially DB_PASSWORD and FAL_API_KEY)

# Build and start all services
docker compose --env-file .env.docker up -d --build

# Run migrations
docker compose exec app php artisan migrate

# View logs
docker compose logs -f
```

## Container Modes

The same Docker image supports multiple modes via the `CONTAINER_MODE` environment variable:

| Mode | Description |
|------|-------------|
| `app` | Application server (default) |
| `queue` | Queue worker |
| `scheduler` | Task scheduler |
| `horizon` | Laravel Horizon |
| `worker` | Custom worker (set `WORKER_COMMAND`) |

## Coolify Deployment

### Single Service Deployment

1. Create a new service in Coolify
2. Set build method to **Dockerfile**
3. Configure environment variables:

```env
APP_ENV=production
APP_KEY=base64:...
APP_URL=https://your-domain.com
CONTAINER_MODE=app
AUTO_MIGRATE=true

DB_CONNECTION=pgsql
DB_HOST=your-postgres-host
DB_PORT=5432
DB_DATABASE=videoeditor
DB_USERNAME=videoeditor
DB_PASSWORD=your-password

REDIS_HOST=your-redis-host
REDIS_PORT=6379

FAL_API_KEY=your-fal-key
```

### Multi-Service Deployment (Recommended)

Deploy separate services for app, queue, and scheduler:

**App Service:**
```env
CONTAINER_MODE=app
AUTO_MIGRATE=true
# ... other env vars
```

**Queue Service:**
```env
CONTAINER_MODE=queue
QUEUE_NAME=default,renders,generations
QUEUE_TIMEOUT=300
QUEUE_MEMORY=512
# ... other env vars
```

**Scheduler Service:**
```env
CONTAINER_MODE=scheduler
# ... other env vars
```

## Environment Variables

### Application
| Variable | Default | Description |
|----------|---------|-------------|
| `CONTAINER_MODE` | `app` | Container mode (see above) |
| `APP_ENV` | `production` | Environment |
| `AUTO_MIGRATE` | `false` | Run migrations on start |

### PHP Settings
| Variable | Default | Description |
|----------|---------|-------------|
| `PHP_MEMORY_LIMIT` | `256M` | Memory limit |
| `PHP_MAX_EXECUTION_TIME` | `60` | Max execution time |
| `PHP_UPLOAD_MAX_FILESIZE` | `100M` | Upload file size limit |
| `PHP_POST_MAX_SIZE` | `100M` | POST size limit |

### Queue Worker Settings
| Variable | Default | Description |
|----------|---------|-------------|
| `QUEUE_CONNECTION` | `redis` | Queue connection |
| `QUEUE_NAME` | `default` | Queue names (comma-separated) |
| `QUEUE_TIMEOUT` | `60` | Job timeout in seconds |
| `QUEUE_TRIES` | `3` | Retry attempts |
| `QUEUE_MAX_JOBS` | `1000` | Jobs before restart |
| `QUEUE_MEMORY` | `128` | Memory limit (MB) |

## Production Tips

1. **Use Redis** for cache, sessions, and queues
2. **Set `AUTO_MIGRATE=false`** and run migrations manually
3. **Scale queue workers** for video processing workloads
4. **Mount persistent storage** for `/var/www/html/storage/app`
5. **Use health checks** - the `/up` endpoint is configured

## Building Locally

```bash
# Build the image
docker build -t videoeditor:latest .

# Run app
docker run -p 8000:8000 --env-file .env.docker videoeditor:latest

# Run queue worker
docker run --env-file .env.docker -e CONTAINER_MODE=queue videoeditor:latest

# Run scheduler
docker run --env-file .env.docker -e CONTAINER_MODE=scheduler videoeditor:latest
```

## Troubleshooting

### Build fails at frontend stage
Ensure `package-lock.json` exists. Run `npm install` locally first.

### Wayfinder routes not working
The build depends on vendor directory. The multi-stage build handles this automatically.

### Queue jobs failing
Check `QUEUE_TIMEOUT` - video processing may need longer timeouts (300-600 seconds).
