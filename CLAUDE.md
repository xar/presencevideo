# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered video editor application built with Laravel 12, Inertia.js v2, and Svelte 5. Users create scene-based video compositions, generate assets via AI (fal.ai), arrange them on a timeline with overlays, and export to MP4 via server-side FFmpeg.

**Key Features:**
- Timeline composition: every element has absolute `start_ms`/`end_ms` and
  optional keyframe animation; scenes are a derived view for editing convenience
- One canvas compositor shared by the live preview and the browser export
- AI generation: text-to-image, image-to-video, text-to-music, text-to-speech
- Drag-and-drop elements with resize handles, snapping and undo per gesture
- Multi-track audio on a Web Audio master clock
- Browser export (WebCodecs) and legacy FFmpeg server-side rendering
- Brand kits: colour/font tokens resolved at render time, lint-enforced compliance
- Agent crew (producer, script, creator, composer, reviewer) that builds
  projects from recipes and patches them until `lintProject()` passes

## Development Commands

```bash
# Start development (server + queue + logs + vite)
composer run dev

# Run all tests (both suites must pass)
php artisan test --compact
npm test              # Vitest: model, compositor, stores, hooks — all headless
npm run check         # svelte-check; expected to be 0 errors
npm run build:model-cli   # esbuild bundle the agents call for lint/recipes (see "Model CLI")

# Run specific test file or filter
php artisan test --compact --filter=AuthenticationTest
php artisan test --compact tests/Feature/Auth/AuthenticationTest.php

# Lint PHP (auto-fix)
vendor/bin/pint --dirty

# Type check Svelte/TypeScript
npm run check

# Frontend unit tests (Vitest)
npm test

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
  - `BrandKit` - colour roles, font roles, logos, watermark, intro/outro, voice,
    music, tone. `projects.brand_kit_id` attaches one. Serialised shape must
    equal the TS `BrandKit` type exactly (nulls included).
- **Enums**: `app/Enums/` - AssetType, AssetSource, GenerationType, GenerationStatus, ProjectStatus, RenderStatus
- **Services**:
  - `FalAIService` - fal.ai API integration for AI generation
  - `FalAI/FalClient` - Low-level HTTP client for fal.ai queue API
  - `FalAI/ModelConfig` - Model configurations with parameters and defaults
  - `FFmpegService` - Video rendering, concatenation, audio mixing
  - `ModelCliService` - runs the TS model (lint, recipes) under Node for the agents
  - `Support/BrandTokens` - PHP half of brand-token resolution (legacy ffmpeg path only)
- **Jobs**: `ProcessAssetUpload`, `RunGeneration`, `RenderProject` (queued)
- **Policies**: `ProjectPolicy`, `AssetPolicy`, `BrandKitPolicy` for authorization

### Agent crew (`app/Ai/`)

Chat runs a crew of laravel/ai agents, each a narrow tool set with a typed hand-off:

```
GenericAgent (PRODUCER: routes only, never touches assets)
  -> script_agent    brief + brand tone -> beats JSON (RecipeBeat[]), structured output
  -> creator_agent   media generation (fal), one generate call per beat, parallel
  -> composer_agent  apply_video_recipe / patch_video_project / lint_video_project loop
  -> reviewer_agent  scored list of concrete patch ops (structured output), max 2 rounds
  -> render (creator_agent: render_video_project / get_render_status)
```

- **Composition goes through recipes and patches, not one giant JSON.**
  `compose_video_project` still exists for legacy flows; new work uses
  `apply_video_recipe` (template as code) then `patch_video_project`
  (`App\Ai\Composition\ProjectPatcher`, pure, unit-tested operations:
  `set_project`, `set_scene`, `add_scene`, `remove_scene`, `add_element`,
  `update_element`, `remove_element`, `set_subtitle_style`,
  `add_subtitle_entries`, `add_audio_clip`).
- **Lint is the definition of done.** The composer patches until
  `lint_video_project` has zero errors and score >= 80. It is the same
  `lintProject()` the editor's Ready tab shows; never write a PHP copy.
- **Model CLI.** `resources/js/headless/model-cli.ts` is bundled by esbuild to
  `resources/js/headless/dist/model-cli.mjs` (gitignored; `npm run build`
  builds it first). One JSON request on stdin, one JSON line on stdout, ops:
  `lint`, `apply_recipe`, `list_recipes`, `validate_brand_kit`. Path in
  `config('render.model_cli.bundle_path')`. This is how PHP runs TS model code
  without a second implementation — extend it rather than porting to PHP.
- **Templates** in `config/agent_video_templates.php` map to a `recipe` id and
  list `brand_slots`; prose there is guidance, the recipe is the structure.
- **Vision reviewer is not built.** laravel/ai accepts image attachments on
  `prompt()` only, not in tool results, so a contact-sheet review must be a
  direct prompt from PHP, not a tool return.
- Tests: `tests/Feature/AgentCrewTest.php` (tool wiring + instructions),
  `tests/Unit/ProjectPatcherTest.php`, `tests/Feature/ModelCliServiceTest.php`
  (runs the real bundle; builds it if missing).

### Chat streaming — the websocket is NOT the source of truth

Chat used to lose messages because Reverb was the only path the output ever
took. Reverb and SSE are equally lossy — neither replays — so durability comes
from making the run *resumable*, not from the transport.

```
POST /agent/messages/send   ONE round trip: creates the agent_invocations row,
                            THEN dispatches. (Two calls meant the client had to
                            subscribe in the gap, and anything emitted first was
                            gone. Never split this again.)
App\Jobs\RunAgentInvocation persists each event to the row, THEN broadcasts
GET  …/{conversation}/state the client re-reads the row whenever it may have
                            missed events — reconnect, tab focus, watchdog,
                            failed subscribe
```

- **`agent_invocations` is the source of truth**, not the socket. `partial_text`
  and `last_seq` are written together in one row update, so they are always
  coherent: events with `seq > last_seq` are exactly the ones not yet in
  `partial_text`. Reconcile takes whichever side is further along, except a
  terminal record which always wins.
- `RunAgentInvocation` runs on the **`agents`** queue. Worker command lines must
  list it (`composer run dev`, `QUEUE_NAME`) or chat silently never answers.
- **`tries` is 1 and must stay 1.** The producer agent dispatches billable,
  externally visible side effects (fal.ai generations, renders); replaying a
  half-finished run would duplicate them. Recovery is by sweeping, never by
  retrying. Its `timeout` sits below the worker `--timeout` (so `failed()` gets
  to mark the row) and below `retry_after`. A test pins both.
- **A killed worker never runs `failed()`.** `agent:sweep-invocations` (scheduled
  every minute) is the only thing that unsticks those clients — the scheduler
  container is load-bearing for chat, not just for renders.
- **Broadcasting must never fail the work.** Everything broadcast is already
  persisted, so send it through `QuietBroadcast::attempt()` /
  `AgentActivityUpdated::dispatchQuietly()`. `AgentActivityUpdated` stays
  `ShouldBroadcastNow` on purpose: it is dispatched from inside long queued
  work, and queueing it would hold it behind the very job that produced it.
- Every send carries an **idempotency key**, so the client can retry a POST
  whose response was lost without starting a second agent run.
- The pure reduction of events and server state lives in
  `resources/js/lib/agent/stream-state.ts` (unit-tested). Live events and a
  reconcile reduce through the SAME functions — that is why a reconnect and a
  delta can never disagree about what is on screen. Transport wiring is in
  `stream-client.ts`; it reports a failed subscription honestly rather than
  resolving on a timeout, which is how events used to vanish unnoticed.

### Server render pipeline — rules that are easy to break

- `RenderProject` runs on the **`renders`** queue. Local dev scripts must pass
  `--queue=default,renders,generations` or renders are never picked up.
- **`retry_after` MUST exceed the job timeout, which must not exceed the worker
  `--timeout`.** Violating this re-dispatches a long render to a second worker
  mid-encode; both then write the same temp files. A test pins the relationship
  so it cannot regress silently.
- Every temp file is uuid-named and tracked, and cleaned on BOTH the success and
  failure paths. Never name a temp file after a domain id.
- Audio intermediates are **WAV (`pcm_s24le`), never MP3** — MP3 added ~26ms of
  encoder delay padding per generation, which defeats the sample-exactness that
  `adelay` positioning assumes.
- Audio is summed **verbatim with `normalize=0` plus `alimiter=limit=0.95`**.
  Never let `amix` divide by input count: loudness would depend on clip count and
  would contradict the volumes the user set. The browser export and the preview
  engine deliberately match this gain staging.
- The **pure timeline math** (`resolveTransitions`, `totalOutputDurationMs`,
  `sceneOutputStartTimes`, `mapTimelineMs`, `shiftSubtitleTracks`) is a contract
  shared with the TypeScript port in `model/timeline.ts`. Change one, change both.
- **The server render now has TWO drivers, chosen by `config('render.driver')`.**
  - `headless` runs the REAL compositor: headless Chrome loads a bare page
    (`resources/js/headless/render.ts`) that calls `exportProjectVideo()` — the
    same `resolveFrame()` + `drawFrame()` + `planProjectAudio()` pipeline as the
    preview and the browser export — and hands the MP4 back in chunks.
    `HeadlessRenderService` (PHP) drives `resources/js/headless/driver.mjs`
    (Puppeteer) over an NDJSON line protocol. **On this path the page owns audio
    end to end**; no ffmpeg audio stage runs.
  - `ffmpeg` is the LEGACY filtergraph renderer (`buildSceneFilterGraph`,
    `drawtext`, `geq` shape masks, `xfade`), kept only as a fallback. Do not
    invest in it; do not add features there that the compositor cannot express
    (e.g. keyframes, which FFmpeg's constant-parameter filters structurally
    cannot do, and which the headless path renders correctly).
- **WebCodecs is gated on a SECURE CONTEXT.** `RENDER_HEADLESS_BASE_URL` must be
  https or a `localhost`/`127.0.0.1` origin, or the page has no `VideoEncoder`
  at all. Chrome (not Chromium) is installed in the image because a Chromium
  built without `ffmpeg_branding=Chrome` cannot DECODE the project's own H.264
  assets, and a decode miss is silent — the render would come out blank.
- Headless Chrome renders without a session, so `RenderAccessToken` mints a
  short-lived, single-project capability and the payload rewrites every asset
  URL onto `editor.headless.*`. Never widen the ordinary asset routes instead.
- `buildSceneAudioFilter` **does** honour `trim_start_ms` (before the `atempo`
  chain, test-covered). A stale note once claimed otherwise — do not "fix" it.
- Fonts: the Docker image installs `fonts-liberation` + `fonts-dejavu-core`
  because `findFontFile()` resolves its family map onto those exact directories.
  Removing them makes all rendered text silently fall back.

### Frontend (Svelte 5 + Inertia)
- **Entry**: `resources/js/app.ts`
- **Pages**: `resources/js/pages/` - Inertia pages
- **Layouts**: `resources/js/layouts/` - AppLayout, AuthLayout with variants
- **UI Library**: `resources/js/components/ui/` - shadcn-svelte (new-york-v4)
- **Types**: `resources/js/types/`
- **Utilities**: `resources/js/lib/` - `cn()` helper, theme, etc.

### Video Editor Frontend

**The single most important rule: there is ONE renderer.** The live preview and the
browser export both resolve a frame with `resolveFrame()` and paint it with
`drawFrame()`. If the preview and an export could ever disagree about a pixel,
that is a bug in the seam, not a missing feature. Never add drawing code to a
component.

The pipeline, in order:

```
Project (stored)
  -> normalizeProject()        fills defaults + legacy timing shim (ONE place)
  -> buildTimeline()           absolute time, global z, transition-aware duration
  -> resolveFrame(p, timeMs)   PURE. the only thing that knows about scenes,
                               trims, keyframes, transitions -> CompositedFrame
  -> drawFrame(ctx, frame, media)   the only thing that knows about pixels
```

- **Page**: `resources/js/pages/editor/Show.svelte`
- **Model** (`resources/js/lib/editor/model/`) — all pure, all unit-tested:
  - `frame.ts` — `CompositedFrame`/`ResolvedFrame`/`ResolvedElement`. **The contract
    between "what the project means" and "how to paint it".** Read this first.
  - `resolve-frame.ts` — `resolveFrame(project, timeMs, { timeline? })`
  - `timeline.ts` — `buildTimeline`, `resolveTransitions`, `mapTimelineMs`
    (ported line-for-line from `FFmpegService` so preview and render agree)
  - `keyframes.ts` / `easing.ts` / `motion-presets.ts` — animation. Keyframe
    `time_ms` is ELEMENT-LOCAL so animation travels with a clip when it is moved.
    Presets generate ordinary keyframes; they stay hand-editable.
  - `text-layout.ts` — shared wrap/align/fit. The reason text no longer differs
    between preview and render.
  - `brand.ts` — brand TOKEN resolution (`brand.primary`, `brand.display`).
    Tokens stay in storage; `resolveFrame()` resolves them inline on every
    colour/font read, so swapping the kit restyles the project. Unresolvable
    tokens fall back to `#ffffff` / `Arial, sans-serif`, literals pass through.
  - `lint.ts` + `lint-profiles.ts` — `lintProject(project, { profile })`, pure.
    Profiles `tiktok | reels | shorts | generic`; safe zones are canvas
    FRACTIONS so any resolution works. Score = 100 - 20·errors - 7·warnings
    - 2·infos. Consumed by `ReadinessPanel.svelte` (Ready tab) and by the agents
    through the model CLI — one implementation, two consumers.
  - `recipes/` — templates as code. `applyRecipe(id, { beats, canvas, fps,
    brand })` returns a composition; each recipe declares `slots` and
    `validateBrandKitForRecipe()` reports what a kit is missing. Every recipe
    MUST lint with zero errors and zero safe-zone warnings at 1080x1920 (tested).
    Output ids are deterministic strings; the PHP tool re-ids them to UUIDs and
    rewrites `track_id` references.
- **Compositor** (`resources/js/lib/editor/compositor/`): `drawFrame`, plus
  `transitions.ts`, `subtitles.ts` and the extracted pure maths in `geometry.ts`
  (fit rects) and `color-eq.ts` (ffmpeg `eq` in YUV, NOT the CSS filter equivalent —
  stored adjustment numbers must keep meaning what they meant).
- **Media** (`resources/js/lib/editor/`):
  - `media-provider.ts` — refcounted, frame-accurate decode per asset URL. Two
    lanes: DEMAND (`getCanvas`, seek+decode+flush, coalesced to the newest scrub
    position) and READ-AHEAD (an open `canvases()` run, playing only). Preview
    decodes downscaled to the canvas; **export stays full-resolution via
    `VideoSampleSink`.**
  - `media-lookup.ts` — bridges async decode to the compositor's SYNCHRONOUS
    `MediaLookup`. A miss is normal and transient: it returns the held frame and
    schedules a decode. Never await in the paint path.
  - `audio-engine.ts` — Web Audio master clock. The AudioContext drives the
    timeline via `timelineStore.syncToClock()`, with the rAF clock as fallback
    for silent projects. `audio-decode.ts` and `planProjectAudio()` are shared
    with the export so the two cannot disagree.
- **Components**: `SceneEditor.svelte` (one `<canvas>` + a transparent
  interaction overlay), `SceneStrip.svelte`, `SceneCard.svelte`,
  `ElementInspector.svelte` (one inspector for every element),
  `PreviewPlayer.svelte`, `AssetPanel.svelte`, `AudioTracks.svelte`,
  `RightPanel.svelte`, `EditorToolbar.svelte`, `AudioPlayback.svelte` (thin
  wiring over `audio-engine`).
- **Stores**: `resources/js/lib/editor/`
  - `project.svelte.ts` - Project state, scene/layer/audio CRUD; `onAfterMutate` hook
  - `timeline.svelte.ts` - Playback clock; `syncToClock()`, `setClockSource()`, `onCurrentSceneChange`
  - `selection.svelte.ts` - rules live in `selection-rules.ts` (pure, tested)
  - `history.svelte.ts` - Undo/redo; use `transaction()` / `beginTransaction()` (never raw begin/endBatch)
  - `normalize.ts` - `normalizeProject()` — the one place payload defaults are filled
  - `selectors.ts` - `getTotalDurationMs`, `getSceneStartsMs`, … Use these; do NOT
    re-derive scene starts with a prefix sum (that mistake existed in 7 places once).
- **Gesture hooks**: `usePointerGesture` (core) → `useTimelineGesture` (move/trim any timeline block) and `useDragResize` (canvas move/resize). Never attach mousemove/mouseup listeners in components.
- **Brand UI**: `BrandKitPicker.svelte` (toolbar, PUTs `brand_kit_id`),
  `BrandColorInput.svelte` (every inspector colour field: native picker plus a
  token select when the project has a kit), `pages/brand-kits/Index.svelte`
  (kit CRUD). `BaseLayer.brand_role` (`logo | watermark | intro | outro`) is
  read by lint only; the compositor ignores it.
- **Limits and flags**: `editor-features.ts` is the ONLY place for feature flags,
  media limits and decode sizing policy. Do not inline a constant elsewhere.
- **Frontend tests**: `npm test` (Vitest, `resources/js/**/*.test.ts`); stores, hooks,
  model and compositor are tested headless.
  `__tests__/real-project.test.ts` pins a REAL project dumped from the dev DB —
  it catches shim gaps that synthetic fixtures miss. Add to it when a real
  project breaks.
- **Types**: `resources/js/types/editor.ts`. Every element is
  `Layer & ClipTiming` with absolute `start_ms`/`end_ms` + optional `keyframes`.
  Scenes are a DERIVED VIEW, not the storage primitive; legacy scene-only
  projects are upgraded lazily in `normalizeElement()` on both the TS and PHP
  sides (never write a data migration for this — see the deliberately empty
  `2026_09_01_065314_backfill_canvas_element_defaults.php`).

## Debugging

### Read the browser's own logs — do this FIRST for any UI bug
Laravel Boost's `browser-logs` tool surfaces real console output from the user's
session. It has solved every hard frontend bug in this project faster than
reading code. Look for:

- `[perf] playback fps=… janky=… dropped=… longTasks=…` — main-thread health.
- `[perf] decode hit=… starved=… decoded=… (…/s, prefetched=…) latency=… worst=…`
  — the decode pipeline (`perf-monitor.ts`, the ONLY profiler; extend it, never
  add a second one).

**How to read them together.** High fps + zero long tasks + high `starved`/low
`hit` means the compositor is fine and the picture simply is not updating —
that is decode starvation, not rendering cost. `prefetched` falling to 0 during
playback means the read-ahead run died, and playback will freeze until the next
seek.

### Symptom → cause table (all of these have actually happened here)

| Symptom | Likely cause |
|---|---|
| Preview is a black box, thumbnails fine | Vite HMR wedged. Deleting a `.svelte` file while `composer run dev` runs breaks the module graph (`Failed to reload …`, `Cannot read properties of undefined (reading 'default')`). Restart the dev server + hard reload. |
| Video plays then freezes until the next scene | Read-ahead livelock or cache pathology — check `prefetched=0` in the decode line. |
| Frame never appears at all | Decode. Check the range-fetch diagnostics; `/editor/assets/{id}/stream` must return `206` with `Content-Range`. |
| Element missing from the canvas | Resolve, not paint. Run `resolveFrame` over the real project in a test before suspecting the compositor. |
| Export differs from preview | A seam bug by definition. Both call the same two functions. |

### Verify against real data, not fixtures
Dump a real project and run the pure model over it — this separates "model bug"
from "rendering bug" in seconds:

```bash
php artisan tinker --execute '$p=App\Models\Project::with("assets")->find(1); echo json_encode([...]);'
npx vitest run resources/js/lib/editor/__tests__/real-project.test.ts --reporter=verbose
```

### Known environment gotchas
- **Prettier cannot format `.svelte` files here** (`getVisitorKeys is not a function`,
  reproduces on untouched files). Format `.ts` with prettier; hand-format Svelte
  to the 4-space house style.
- Deleting a component during a dev session wedges HMR (see table above).
- Two pre-existing eslint errors (`prefer-svelte-reactivity`, Map vs SvelteMap) in
  `canvas-snapping.svelte.ts` and `generations.svelte.ts` are not yours.

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
- Element types: `video`, `image`, `text`, `shape`. Production data also contains
  unknown types (e.g. `effect`) and non-canonical values (`shape:"rect"`,
  `font_weight:"600"`): normalization must PASS THESE THROUGH untouched and never
  throw. Rewriting stored user data is a separate, deliberate decision.
- All times in milliseconds. Element timing is absolute (`start_ms`/`end_ms`);
  keyframe `time_ms` is element-local.
- **Extend the primitive, never copy per component.** Duplicated logic drifting is
  historically the #1 source of bugs here — it caused the three-renderer problem,
  seven copies of the scene prefix sum, and two copies of the audio decoder.
- Anything that could make the preview and the export disagree belongs in a
  shared pure function, not in two places that "should" match.
- Colour and font fields may hold a `brand.<role>` token. Never write a
  resolved literal back into storage on behalf of a token, and never validate
  those fields as strict hex.
- "Production-ready" has an objective definition here: `lintProject()` under
  the target platform profile. New platform rules go into `lint.ts`, not into
  agent prose or a component.

<laravel-boost-guidelines>
=== foundation rules ===

# Laravel Boost Guidelines

The Laravel Boost guidelines are specifically curated by Laravel maintainers for this application. These guidelines should be followed closely to ensure the best experience when building Laravel applications.

## Foundational Context

This application is a Laravel application running on PHP 8.4. You are an expert with the Laravel ecosystem. Always use the APIs that match the installed major version of each package — do not assume a version.

Before relying on a package's API, confirm its installed version:
- PHP packages: run `composer show --direct` to list direct dependencies with versions, or `composer show <vendor/package>` for a single package.
- JS packages: check `package.json` for the installed versions.

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

- Use `search-docs` before changes that depend on Laravel ecosystem APIs, behavior, configuration, or version-specific syntax. Skip it for copy-only edits and other changes where package documentation is irrelevant. Reuse sufficient results already in context instead of searching again.
- Pass a `packages` array to scope results when you know which packages are relevant.
- Use multiple broad, topic-based queries: `['rate limiting', 'routing rate limiting', 'routing']`. Expect the most relevant results first.
- Do not add package names to queries because package info is already shared. Use `test resource table`, not `filament 4 test resource table`.

### Search Syntax

1. Use words for auto-stemmed AND logic: `rate limit` matches both "rate" AND "limit".
2. Use `"quoted phrases"` for exact position matching: `"infinite scroll"` requires adjacent words in order.
3. Combine words and phrases for mixed queries: `middleware "rate limit"`.
4. Use multiple queries for OR logic: `queries=["authentication", "middleware"]`.

## Project Rules

- This project contains committed, area-grouped rules in `.ai/rules` when that directory exists (settled decisions, non-obvious traps, standing constraints). Framework and package guidelines that only apply to specific paths (testing, frontend, components) also live there, under `.ai/rules/boost` — this is not just recorded decisions, it is load-bearing guidance you have not seen inline. Before you enter plan mode or create/edit any file, you MUST first: open @.ai/rules/index.md (it maps file globs to rule files), read every rule file whose globs cover the path(s) in scope, and run `grep -rin 'keyword' .ai/rules` to catch what a path match alone misses. Do not write code until you have read and are following every matching rule. If `.ai/rules` does not exist, continue without it.
- Record a rule with `record-rule` only when the user explicitly asks for one. Instructions for the work at hand are not rules, no matter how emphatic: "remove this typo", "use X here" are work to do, not rules to record. Never record a rule on your own initiative, as a byproduct of a change, or to summarize what you just did. When the user does ask, pass a `glob` (e.g. `app/Http/Controllers/**`), a short `title`, and a few-line `note`. Use `record-rule` rather than your native memory or notes tool, because native memory is personal and session-scoped, while only `.ai/rules` is shared with the team and persists in the repo.

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
- Activate the `deploying-to-cloud` skill whenever deploying to Laravel Cloud, configuring Cloud environments or resources, using the Cloud CLI, or troubleshooting Cloud deployments.

=== herd rules ===

# Laravel Herd

- The application is served by Laravel Herd at `https?://[kebab-case-project-dir].test`. Use the `get-absolute-url` tool to generate valid URLs. Never run commands to serve the site. It is always available.
- Use the `herd` CLI to manage services, PHP versions, and sites (e.g. `herd sites`, `herd services:start <service>`, `herd php:list`). Run `herd list` to discover all available commands.

=== tests rules ===

# Test Enforcement

- Add or update tests for behavior and logic changes when a test provides meaningful regression coverage.
- Pure copy, styling, and layout-only changes do not require new or updated tests.
- When test coverage applies, run the affected tests and ensure they pass.
- Test the changed behavior and its important failure modes, but do not add tests beyond them.
- Read the `testing-best-practices` skill before writing tests.

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

=== laravel-octane/core rules ===

# Laravel Octane

This application uses Laravel Octane, a long-running PHP server. The application bootstraps once and handles many requests within the same process.

- Never store request-specific state in singletons or static properties, because it can leak across requests.
- Use `config('octane.server')` to detect the active driver (`swoole`, `roadrunner`, or `frankenphp`).
- Prefer scoped bindings (`$this->app->scoped()`) over singletons for per-request services.

When working on Octane-specific features (concurrency, shared tables, memory, driver configuration, testing), invoke `octane-development` for detailed rules.

=== wayfinder/core rules ===

# Laravel Wayfinder

Use Wayfinder to generate TypeScript functions for Laravel routes. Import from `@/actions/` (controllers) or `@/routes/` (named routes).

=== pint/core rules ===

# Laravel Pint Code Formatter

- If you have modified any PHP files, you must run `vendor/bin/pint --dirty --format agent` before finalizing changes to ensure your code matches the project's expected style.
- Do not run `vendor/bin/pint --test --format agent`, simply run `vendor/bin/pint --format agent` to fix any formatting issues.

=== pest/core rules ===

# Pest

- This project uses Pest. Create tests with `php artisan make:test --pest {name}`.
- Do not include the test suite directory in `{name}`. Use `SomeFeatureTest`, not `Feature/SomeFeatureTest`.
- Read the `testing-best-practices` skill for guidance on coverage, naming, structure, dependency isolation, and review.
- Do not delete tests or test files without approval. They are part of the application.

## Running Tests

- Run the narrowest set of tests that covers the change. Pass a file path or `--filter=testName` to `php artisan test --compact`.
- Rerun a test after each change to it.
- Run `vendor/bin/pest` to call the test runner directly. It accepts the same file path and `--filter=testName` arguments.
- After the feature tests pass, ask the user to run the complete suite with `php artisan test --compact`.

=== inertia-svelte/core rules ===

# Inertia + Svelte

- IMPORTANT: Activate `inertia-svelte-development` when working with Inertia Svelte client-side patterns.

</laravel-boost-guidelines>
