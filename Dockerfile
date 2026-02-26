# =============================================================================
# Multi-stage Dockerfile for Laravel + Svelte application
# Supports: app server, queue worker, scheduler
# Optimized for Coolify deployment with fast builds
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: PHP Dependencies (cached layer)
# -----------------------------------------------------------------------------
FROM composer:2 AS composer-deps

WORKDIR /app

# Copy only composer files first for better caching
COPY composer.json composer.lock ./

# Install dependencies without dev packages and scripts
RUN composer install \
    --no-dev \
    --no-scripts \
    --no-autoloader \
    --prefer-dist \
    --ignore-platform-reqs

# -----------------------------------------------------------------------------
# Stage 2: Frontend Build
# -----------------------------------------------------------------------------
FROM node:24-alpine AS frontend-build

WORKDIR /app

# Set environment to skip Wayfinder regeneration (files are pre-committed)
ENV DOCKER_BUILD=true

# Copy package files first for better caching
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci --include=optional

# Copy frontend source files (Wayfinder routes are pre-committed)
COPY resources ./resources
COPY public ./public
COPY vite.config.ts tsconfig.json ./

# Build frontend assets
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 3: Production Image
# -----------------------------------------------------------------------------
FROM ubuntu:24.04 AS production

LABEL maintainer="Video Editor Team"
LABEL org.opencontainers.image.title="Video Editor"
LABEL org.opencontainers.image.description="AI-powered video editor with Laravel, Inertia.js, and Svelte"

# Build arguments
ARG NODE_VERSION=24
ARG POSTGRES_VERSION=18
ARG APP_ENV=production
ARG CONTAINER_MODE=app

# Environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC
ENV APP_ENV=${APP_ENV}
ENV CONTAINER_MODE=${CONTAINER_MODE}

# PHP-FPM/Octane settings
ENV PHP_OPCACHE_ENABLE=1
ENV PHP_OPCACHE_VALIDATE_TIMESTAMPS=0
ENV PHP_MEMORY_LIMIT=512M
ENV PHP_MAX_EXECUTION_TIME=120
ENV PHP_UPLOAD_MAX_FILESIZE=500M
ENV PHP_POST_MAX_SIZE=500M

WORKDIR /var/www/html

# Set timezone
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Install system dependencies
RUN apt-get update && apt-get upgrade -y \
    && mkdir -p /etc/apt/keyrings \
    && apt-get install -y \
    gnupg \
    curl \
    ca-certificates \
    zip \
    unzip \
    git \
    supervisor \
    sqlite3 \
    libcap2-bin \
    libpng-dev \
    dnsutils \
    netcat-openbsd \
    # FFmpeg for video processing
    ffmpeg \
    # Image processing
    libgd3 \
    imagemagick \
    # Add Caddy repository
    && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg \
    && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list \
    # Add PHP PPA
    && curl -sS 'https://keyserver.ubuntu.com/pks/lookup?op=get&search=0xb8dc7e53946656efbce4c1dd71daeaab4ad4cab6' | gpg --dearmor | tee /etc/apt/keyrings/ppa_ondrej_php.gpg > /dev/null \
    && echo "deb [signed-by=/etc/apt/keyrings/ppa_ondrej_php.gpg] https://ppa.launchpadcontent.net/ondrej/php/ubuntu noble main" > /etc/apt/sources.list.d/ppa_ondrej_php.list \
    && apt-get update \
    # Install Caddy
    && apt-get install -y caddy \
    # Install PHP and extensions
    && apt-get install -y \
    php8.5-cli \
    php8.5-fpm \
    php8.5-pgsql \
    php8.5-sqlite3 \
    php8.5-gd \
    php8.5-curl \
    php8.5-mysql \
    php8.5-mbstring \
    php8.5-xml \
    php8.5-zip \
    php8.5-bcmath \
    php8.5-intl \
    php8.5-redis \
    php8.5-imagick \
    # PostgreSQL client (optional, for pg_dump etc)
    && curl -sS https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor | tee /etc/apt/keyrings/pgdg.gpg >/dev/null \
    && echo "deb [signed-by=/etc/apt/keyrings/pgdg.gpg] http://apt.postgresql.org/pub/repos/apt noble-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y postgresql-client-$POSTGRES_VERSION \
    # Cleanup
    && apt-get -y autoremove \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Install Composer
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# Create application user (use UID 1001 to avoid conflict with Ubuntu's default user)
RUN groupadd --force -g 1001 www \
    && useradd -ms /bin/bash --no-user-group -g www -u 1001 www

# Create required directories for PHP-FPM
RUN mkdir -p /var/log/php-fpm /tmp/opcache /run/php \
    && chown -R www:www /var/log/php-fpm /tmp/opcache /run/php

# Configure PHP-FPM pid file location and error logging
RUN sed -i 's|pid = .*|pid = /run/php/php-fpm.pid|' /etc/php/8.5/fpm/php-fpm.conf \
    && sed -i 's|error_log = .*|error_log = /dev/stderr|' /etc/php/8.5/fpm/php-fpm.conf

# Copy application files
COPY --chown=www:www . /var/www/html

# Copy composer dependencies from build stage
COPY --from=composer-deps --chown=www:www /app/vendor /var/www/html/vendor

# Copy built frontend assets from build stage
COPY --from=frontend-build --chown=www:www /app/public/build /var/www/html/public/build

# Run composer optimizations
RUN composer dump-autoload --optimize --no-dev --classmap-authoritative

# Copy PHP-FPM pool configuration
COPY docker/php-fpm/www.conf /etc/php/8.5/fpm/pool.d/www.conf
COPY docker/php-fpm/php.ini /etc/php/8.5/fpm/conf.d/99-production.ini
COPY docker/php-fpm/php.ini /etc/php/8.5/cli/conf.d/99-production.ini

# Copy Caddy configuration
COPY docker/caddy/Caddyfile /etc/caddy/Caddyfile

# Copy supervisor and entrypoint
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh

# Set permissions
RUN chmod +x /usr/local/bin/entrypoint.sh \
    && chown -R www:www /var/www/html \
    && chmod -R 775 /var/www/html/storage \
    && chmod -R 775 /var/www/html/bootstrap/cache

# Create required directories
RUN mkdir -p /var/www/html/storage/logs \
    && mkdir -p /var/www/html/storage/framework/cache \
    && mkdir -p /var/www/html/storage/framework/sessions \
    && mkdir -p /var/www/html/storage/framework/views \
    && chown -R www:www /var/www/html/storage

EXPOSE 8000

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
