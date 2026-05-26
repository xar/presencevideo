# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered video editor application built with Laravel 12, Inertia.js v2, and Svelte 5. Users create scene-based video compositions, generate assets via AI (fal.ai), arrange them on a timeline with overlays, and export to MP4 via server-side FFmpeg.

**Key Features:**
- Scene-based video composition (not frame-accurate NLE)
- AI generation: text-to-image, image-to-video, text-to-music, text-to-speech
- Drag-and-drop layers with resize handles
- Multi-track audio timeline
- FFmpeg-based server-side rendering

## Development Commands

```bash
# Start development (server + queue + logs + vite)
composer run dev

# Run all tests
php artisan test --compact

# Run specific test file or filter
php artisan test --compact --filter=AuthenticationTest
php artisan test --compact tests/Feature/Auth/AuthenticationTest.php

# Lint PHP (auto-fix)
vendor/bin/pint --dirty

# Type check Svelte/TypeScript
npm run check

# Build frontend
npm run build
```

## Architecture

### Backend (Laravel 12)
- **Routes**: `routes/web.php` (main), `routes/settings.php` (settings), `routes/editor.php` (video editor)
- **Controllers**: `app/Http/Controllers/` - Settings controllers handle profile, password, 2FA
- **Middleware**: Configured in `bootstrap/app.php` (Laravel 12 style, no Kernel.php)
- **Auth**: Laravel Fortify provides authentication routes/controllers

### Video Editor Backend
- **Routes**: `routes/editor.php` - Project CRUD, asset upload, generation, render endpoints
- **Models**:
  - `Project` - scenes (JSON), audio_tracks (JSON), resolution, status
  - `Asset` - uploaded/generated media files with metadata
  - `Generation` - AI generation requests (text-to-image, image-to-video, etc.)
  - `Render` - FFmpeg render jobs with progress tracking
- **Enums**: `app/Enums/` - AssetType, AssetSource, GenerationType, GenerationStatus, ProjectStatus, RenderStatus
- **Services**:
  - `FalAIService` - fal.ai API integration for AI generation
  - `FalAI/FalClient` - Low-level HTTP client for fal.ai queue API
  - `FalAI/ModelConfig` - Model configurations with parameters and defaults
  - `FFmpegService` - Video rendering, concatenation, audio mixing
- **Jobs**: `ProcessAssetUpload`, `RunGeneration`, `RenderProject` (queued)
- **Policies**: `ProjectPolicy`, `AssetPolicy` for authorization

### Frontend (Svelte 5 + Inertia)
- **Entry**: `resources/js/app.ts`
- **Pages**: `resources/js/pages/` - Inertia pages
- **Layouts**: `resources/js/layouts/` - AppLayout, AuthLayout with variants
- **UI Library**: `resources/js/components/ui/` - shadcn-svelte (new-york-v4)
- **Types**: `resources/js/types/`
- **Utilities**: `resources/js/lib/` - `cn()` helper, theme, etc.

### Video Editor Frontend
- **Page**: `resources/js/pages/editor/Show.svelte` - Main editor page
- **Components**: `resources/js/components/editor/`
  - `SceneStrip.svelte` - Horizontal scene timeline with drag-to-reorder
  - `SceneCard.svelte` - Scene thumbnail with playback indicator
  - `SceneEditor.svelte` - WYSIWYG canvas for layer editing
  - `LayerItem.svelte` - Draggable/resizable layer with handles
  - `PreviewPlayer.svelte` - Playback controls and time display
  - `AssetPanel.svelte` - Upload and asset gallery
  - `AudioTracks.svelte` - Multi-track audio timeline
  - `RightPanel.svelte` - Properties and AI generation tabs
  - `EditorToolbar.svelte` - Save, export, zoom controls
- **Stores**: `resources/js/lib/editor/`
  - `project.svelte.ts` - Project state, scene/layer/audio CRUD
  - `timeline.svelte.ts` - Playback state, current time, scene switching
  - `selection.svelte.ts` - Selected scene/layer, current tool
- **Types**: `resources/js/types/editor.ts` - Project, Scene, Layer, AudioTrack interfaces

### Path Aliases
- `@/` maps to `resources/js/`
- `@/actions/` and `@/routes/` - Wayfinder-generated route functions

## UI Components (shadcn-svelte)

```bash
npx shadcn-svelte@next add <component-name>
```

## Environment Variables

```bash
FAL_KEY=your_fal_ai_key  # Required for AI generation
```

## AI Generation Models (fal.ai)

Models are configured in `app/Services/FalAI/ModelConfig.php`:

**Text to Image:**
- FLUX.1 Dev/Schnell/Pro Ultra - High-quality flow transformer
- Recraft V3 - SOTA with typography support
- Stable Diffusion 3.5 Large

**Image to Video:**
- MiniMax Video - Natural motion
- Kling 1.0 Standard/Pro - Reliable video generation
- Luma Dream Machine - Dreamlike transitions
- Wan 2.1 - High fidelity

**Audio:**
- Stable Audio - Music and SFX from text
- MusicGen - Melody generation
- Kokoro/F5-TTS/PlayHT - Text-to-speech

## Key Conventions

- Svelte 5 runes: `$props()`, `$state()`, `$derived()`
- Layouts use snippets: `{@render children?.()}`
- Editor stores use singleton pattern with `$state` for reactivity
- Layer types: `video`, `image`, `text` - each with specific properties
- Scene durations in milliseconds (`duration_ms`)

<laravel-boost-guidelines>
=== foundation rules ===

# Laravel Boost Guidelines

The Laravel Boost guidelines are specifically curated by Laravel maintainers for this application. These guidelines should be followed closely to ensure the best experience when building Laravel applications.

## Foundational Context

This application is a Laravel application and its main Laravel ecosystems package & versions are below. You are an expert with them all. Ensure you abide by these specific packages & versions.

- php - 8.4
- inertiajs/inertia-laravel (INERTIA_LARAVEL) - v2
- laravel/ai (AI) - v0
- laravel/fortify (FORTIFY) - v1
- laravel/framework (LARAVEL) - v12
- laravel/octane (OCTANE) - v2
- laravel/prompts (PROMPTS) - v0
- laravel/reverb (REVERB) - v1
- laravel/telescope (TELESCOPE) - v5
- laravel/wayfinder (WAYFINDER) - v0
- laravel/boost (BOOST) - v2
- laravel/mcp (MCP) - v0
- laravel/pail (PAIL) - v1
- laravel/pint (PINT) - v1
- laravel/sail (SAIL) - v1
- pestphp/pest (PEST) - v4
- phpunit/phpunit (PHPUNIT) - v12
- @inertiajs/svelte (INERTIA_SVELTE) - v2
- tailwindcss (TAILWINDCSS) - v4
- @laravel/vite-plugin-wayfinder (WAYFINDER_VITE) - v0
- eslint (ESLINT) - v9
- laravel-echo (ECHO) - v2
- prettier (PRETTIER) - v3

## Skills Activation

This project has domain-specific skills available in `**/skills/**`. You MUST activate the relevant skill whenever you work in that domain—don't wait until you're stuck.

## Conventions

- You must follow all existing code conventions used in this application. When creating or editing a file, check sibling files for the correct structure, approach, and naming.
- Use descriptive names for variables and methods. For example, `isRegisteredForDiscounts`, not `discount()`.
- Check for existing components to reuse before writing a new one.

## Verification Scripts

- Do not create verification scripts or tinker when tests cover that functionality and prove they work. Unit and feature tests are more important.

## Application Structure & Architecture

- Stick to existing directory structure; don't create new base folders without approval.
- Do not change the application's dependencies without approval.

## Frontend Bundling

- If the user doesn't see a frontend change reflected in the UI, it could mean they need to run `npm run build`, `npm run dev`, or `composer run dev`. Ask them.

## Documentation Files

- You must only create documentation files if explicitly requested by the user.

## Replies

- Be concise in your explanations - focus on what's important rather than explaining obvious details.

=== boost rules ===

# Laravel Boost

## Tools

- Laravel Boost is an MCP server with tools designed specifically for this application. Prefer Boost tools over manual alternatives like shell commands or file reads.
- Use `database-query` to run read-only queries against the database instead of writing raw SQL in tinker.
- Use `database-schema` to inspect table structure before writing migrations or models.
- Use `get-absolute-url` to resolve the correct scheme, domain, and port for project URLs. Always use this before sharing a URL with the user.
- Use `browser-logs` to read browser logs, errors, and exceptions. Only recent logs are useful, ignore old entries.

## Searching Documentation (IMPORTANT)

- Always use `search-docs` before making code changes. Do not skip this step. It returns version-specific docs based on installed packages automatically.
- Pass a `packages` array to scope results when you know which packages are relevant.
- Use multiple broad, topic-based queries: `['rate limiting', 'routing rate limiting', 'routing']`. Expect the most relevant results first.
- Do not add package names to queries because package info is already shared. Use `test resource table`, not `filament 4 test resource table`.

### Search Syntax

1. Use words for auto-stemmed AND logic: `rate limit` matches both "rate" AND "limit".
2. Use `"quoted phrases"` for exact position matching: `"infinite scroll"` requires adjacent words in order.
3. Combine words and phrases for mixed queries: `middleware "rate limit"`.
4. Use multiple queries for OR logic: `queries=["authentication", "middleware"]`.

## Artisan

- Run Artisan commands directly via the command line (e.g., `php artisan route:list`). Use `php artisan list` to discover available commands and `php artisan [command] --help` to check parameters.
- Inspect routes with `php artisan route:list`. Filter with: `--method=GET`, `--name=users`, `--path=api`, `--except-vendor`, `--only-vendor`.
- Read configuration values using dot notation: `php artisan config:show app.name`, `php artisan config:show database.default`. Or read config files directly from the `config/` directory.

## Tinker

- Execute PHP in app context for debugging and testing code. Do not create models without user approval, prefer tests with factories instead. Prefer existing Artisan commands over custom tinker code.
- Always use single quotes to prevent shell expansion: `php artisan tinker --execute 'Your::code();'`
  - Double quotes for PHP strings inside: `php artisan tinker --execute 'User::where("active", true)->count();'`

=== php rules ===

# PHP

- Always use curly braces for control structures, even for single-line bodies.
- Use PHP 8 constructor property promotion: `public function __construct(public GitHub $github) { }`. Do not leave empty zero-parameter `__construct()` methods unless the constructor is private.
- Use explicit return type declarations and type hints for all method parameters: `function isAccessible(User $user, ?string $path = null): bool`
- Use TitleCase for Enum keys: `FavoritePerson`, `BestLake`, `Monthly`.
- Prefer PHPDoc blocks over inline comments. Only add inline comments for exceptionally complex logic.
- Use array shape type definitions in PHPDoc blocks.

=== deployments rules ===

# Deployment

- Laravel can be deployed using [Laravel Cloud](https://cloud.laravel.com/), which is the fastest way to deploy and scale production Laravel applications.

=== herd rules ===

# Laravel Herd

- The application is served by Laravel Herd at `https?://[kebab-case-project-dir].test`. Use the `get-absolute-url` tool to generate valid URLs. Never run commands to serve the site. It is always available.
- Use the `herd` CLI to manage services, PHP versions, and sites (e.g. `herd sites`, `herd services:start <service>`, `herd php:list`). Run `herd list` to discover all available commands.

=== tests rules ===

# Test Enforcement

- Every change must be programmatically tested. Write a new test or update an existing test, then run the affected tests to make sure they pass.
- Run the minimum number of tests needed to ensure code quality and speed. Use `php artisan test --compact` with a specific filename or filter.

=== inertia-laravel/core rules ===

# Inertia

- Inertia creates fully client-side rendered SPAs without modern SPA complexity, leveraging existing server-side patterns.
- Components live in `resources/js/pages` (unless specified in `vite.config.js`). Use `Inertia::render()` for server-side routing instead of Blade views.
- ALWAYS use `search-docs` tool for version-specific Inertia documentation and updated code examples.
- IMPORTANT: Activate `inertia-svelte-development` when working with Inertia Svelte client-side patterns.

# Inertia v2

- Use all Inertia features from v1 and v2. Check the documentation before making changes to ensure the correct approach.
- New features: deferred props, infinite scroll, merging props, polling, prefetching, once props, flash data.
- When using deferred props, add an empty state with a pulsing or animated skeleton.

=== laravel/core rules ===

# Do Things the Laravel Way

- Use `php artisan make:` commands to create new files (i.e. migrations, controllers, models, etc.). You can list available Artisan commands using `php artisan list` and check their parameters with `php artisan [command] --help`.
- If you're creating a generic PHP class, use `php artisan make:class`.
- Pass `--no-interaction` to all Artisan commands to ensure they work without user input. You should also pass the correct `--options` to ensure correct behavior.

### Model Creation

- When creating new models, create useful factories and seeders for them too. Ask the user if they need any other things, using `php artisan make:model --help` to check the available options.

## APIs & Eloquent Resources

- For APIs, default to using Eloquent API Resources and API versioning unless existing API routes do not, then you should follow existing application convention.

## URL Generation

- When generating links to other pages, prefer named routes and the `route()` function.

## Testing

- When creating models for tests, use the factories for the models. Check if the factory has custom states that can be used before manually setting up the model.
- Faker: Use methods such as `$this->faker->word()` or `fake()->randomDigit()`. Follow existing conventions whether to use `$this->faker` or `fake()`.
- When creating tests, make use of `php artisan make:test [options] {name}` to create a feature test, and pass `--unit` to create a unit test. Most tests should be feature tests.

## Vite Error

- If you receive an "Illuminate\Foundation\ViteException: Unable to locate file in Vite manifest" error, you can run `npm run build` or ask the user to run `npm run dev` or `composer run dev`.

=== laravel/v12 rules ===

# Laravel 12

- CRITICAL: ALWAYS use `search-docs` tool for version-specific Laravel documentation and updated code examples.
- Since Laravel 11, Laravel has a new streamlined file structure which this project uses.

## Laravel 12 Structure

- In Laravel 12, middleware are no longer registered in `app/Http/Kernel.php`.
- Middleware are configured declaratively in `bootstrap/app.php` using `Application::configure()->withMiddleware()`.
- `bootstrap/app.php` is the file to register middleware, exceptions, and routing files.
- `bootstrap/providers.php` contains application specific service providers.
- The `app/Console/Kernel.php` file no longer exists; use `bootstrap/app.php` or `routes/console.php` for console configuration.
- Console commands in `app/Console/Commands/` are automatically available and do not require manual registration.

## Database

- When modifying a column, the migration must include all of the attributes that were previously defined on the column. Otherwise, they will be dropped and lost.
- Laravel 12 allows limiting eagerly loaded records natively, without external packages: `$query->latest()->limit(10);`.

### Models

- Casts can and likely should be set in a `casts()` method on a model rather than the `$casts` property. Follow existing conventions from other models.

=== octane/core rules ===

# Octane

- Octane boots the application once and reuses it across requests, so singletons persist between requests.
- The Laravel container's `scoped` method may be used as a safe alternative to `singleton`.
- Never inject the container, request, or config repository into a singleton's constructor; use a resolver closure or `bind()` instead:

```php
// Bad
$this->app->singleton(Service::class, fn (Application $app) => new Service($app['request']));

// Good
$this->app->singleton(Service::class, fn () => new Service(fn () => request()));
```

- Never append to static properties, as they accumulate in memory across requests.

=== wayfinder/core rules ===

# Laravel Wayfinder

Use Wayfinder to generate TypeScript functions for Laravel routes. Import from `@/actions/` (controllers) or `@/routes/` (named routes).

=== pint/core rules ===

# Laravel Pint Code Formatter

- If you have modified any PHP files, you must run `vendor/bin/pint --dirty --format agent` before finalizing changes to ensure your code matches the project's expected style.
- Do not run `vendor/bin/pint --test --format agent`, simply run `vendor/bin/pint --format agent` to fix any formatting issues.

=== pest/core rules ===

## Pest

- This project uses Pest for testing. Create tests: `php artisan make:test --pest {name}`.
- The `{name}` argument should not include the test suite directory. Use `php artisan make:test --pest SomeFeatureTest` instead of `php artisan make:test --pest Feature/SomeFeatureTest`.
- Run tests: `php artisan test --compact` or filter: `php artisan test --compact --filter=testName`.
- Do NOT delete tests without approval.

=== inertia-svelte/core rules ===

# Inertia + Svelte

- IMPORTANT: Activate `inertia-svelte-development` when working with Inertia Svelte client-side patterns.

</laravel-boost-guidelines>
