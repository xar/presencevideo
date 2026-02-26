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

### PHP Settings (App Server)
| Variable | Default | Description |
|----------|---------|-------------|
| `PHP_MEMORY_LIMIT` | `512M` | Memory limit |
| `PHP_MAX_EXECUTION_TIME` | `120` | Max execution time (seconds) |
| `PHP_UPLOAD_MAX_FILESIZE` | `500M` | Upload file size limit |
| `PHP_POST_MAX_SIZE` | `500M` | POST size limit |

### PHP Settings (Queue Workers - Production)
Queue workers have higher limits for video processing:
| Setting | Value | Description |
|---------|-------|-------------|
| `PHP_MEMORY_LIMIT` | `2G` | High memory for FFmpeg |
| `PHP_MAX_EXECUTION_TIME` | `0` | Unlimited (jobs have own timeout) |
| `PHP_UPLOAD_MAX_FILESIZE` | `2G` | Large video uploads |
| `PHP_POST_MAX_SIZE` | `2G` | Large video uploads |

### Queue Worker Settings
| Variable | Default | Description |
|----------|---------|-------------|
| `QUEUE_CONNECTION` | `redis` | Queue connection |
| `QUEUE_NAME` | `default,renders,generations` | Queue names (comma-separated) |
| `QUEUE_TIMEOUT` | `900` | Job timeout (15 min for video) |
| `QUEUE_TRIES` | `3` | Retry attempts |
| `QUEUE_MAX_JOBS` | `100` | Jobs before restart (memory cleanup) |
| `QUEUE_MEMORY` | `2048` | Memory limit (2GB) |
| `QUEUE_WORKERS` | `3` | Number of worker replicas |

## Resource Allocation (Production)

The production config (`docker-compose.prod.yml`) allocates significant resources for video processing:

| Service | CPU Limit | Memory Limit | Replicas |
|---------|-----------|--------------|----------|
| App | 4 cores | 2 GB | 1 |
| Queue | 8 cores | 8 GB | 3 |
| Scheduler | 1 core | 512 MB | 1 |
| PostgreSQL | 4 cores | 4 GB | 1 |
| Redis | 2 cores | 2 GB | 1 |

**Total minimum requirements:** ~20 CPU cores, ~24 GB RAM

For smaller servers, adjust in `.env.docker`:
```env
QUEUE_WORKERS=1
QUEUE_MEMORY=1024
```

Or override in `docker-compose.prod.yml`.

## Production Tips

1. **Use Redis** for cache, sessions, and queues
2. **Set `AUTO_MIGRATE=false`** and run migrations manually
3. **Scale queue workers** for video processing workloads
4. **Mount persistent storage** for `/var/www/html/storage/app`
5. **Use health checks** - the `/up` endpoint is configured
6. **Monitor memory** - FFmpeg can be memory-intensive

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
