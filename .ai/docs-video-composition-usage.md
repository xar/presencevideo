# Video Composition Usage

This project now has Laravel-side primitives for programmatically building complete video projects without hand-writing nested JSON arrays.

## Main entry point

Use:

```php
use App\Video\Composition\ProjectComposer;

$composer = ProjectComposer::for($project)
    ->resolution(1080, 1920)
    ->fps(30);
```

The composer writes to the existing project JSON fields:

- `scenes`
- `audio_tracks`
- `video_tracks`
- `subtitle_tracks`

Call `save()` when finished:

```php
$project = $composer->save();
```

## Create scenes

```php
$composer->scene('Intro')
    ->duration(3000)
    ->background('#000000')
    ->image($imageAsset)
    ->cover();
```

A scene can contain image, video, and text layers.

```php
$composer->scene('Demo')
    ->duration(6000)
    ->video($videoAsset)
    ->fill()
    ->trim(0, 6000);
```

## Add text layers

```php
$composer->scene('Hook')
    ->duration(3000)
    ->text('Laravel now has video primitives')
    ->position(80, 220)
    ->size(920, 260)
    ->fontSize(68)
    ->stroke('#000000', 5)
    ->zIndex(1);
```

## Layout helpers

Available on layer-like builders:

```php
->position(100, 200)
->size(800, 400)
->center()
->fill()
->cover()
->contain(80)
->safeArea(80)
->zIndex(2)
->opacity(0.8)
```

Notes:

- `fill()` stretches to the full project resolution.
- `cover()` currently aliases `fill()`.
- `contain($margin)` fits inside project bounds with a margin.
- `safeArea($margin)` aliases `contain($margin)`.

## Add audio tracks

```php
$composer->audioTrack('Music')
    ->volume(0.5)
    ->clip($musicAsset)
    ->start(0)
    ->duration(9000)
    ->volume(0.4)
    ->fadeIn(500)
    ->fadeOut(500);
```

Audio clip helpers:

```php
->start(0)
->duration(9000)
->trim(1000)
->volume(0.4)
->fadeIn(500)
->fadeOut(500)
```

## Add global video overlays

Use video tracks for persistent overlays, badges, picture-in-picture, or timed text overlays across the full project timeline.

```php
$composer->videoTrack('Persistent badge')
    ->text('Built with ProjectComposer')
    ->position(90, 1540)
    ->size(900, 120)
    ->fontSize(42)
    ->stroke('#000000', 3);
```

You can also add a video asset overlay:

```php
$composer->videoTrack('Picture in picture')
    ->video($overlayVideoAsset)
    ->position(700, 120)
    ->size(300, 533)
    ->opacity(0.95);
```

## Add subtitles

```php
use App\Video\Composition\Data\StyleData;

$composer->subtitles('Captions')
    ->style(StyleData::subtitle())
    ->entry(0, 1800, 'First line')
    ->entry(1800, 3600, 'Second line');
```

Available style presets:

```php
StyleData::headline()
StyleData::caption()
StyleData::subtitle()
StyleData::lowerThird()
```

## Timeline helpers

```php
use App\Video\Composition\Timeline;

$milliseconds = Timeline::seconds(3.5); // 3500
$total = Timeline::totalDuration($project);
$sceneStart = Timeline::sceneStart($project, $sceneId);
$absoluteMs = Timeline::sceneRelativeToProject($project, $sceneId, 1200);
```

## Full example

```php
use App\Video\Composition\Data\StyleData;
use App\Video\Composition\ProjectComposer;

$composer = ProjectComposer::for($project)
    ->resolution(1080, 1920)
    ->fps(30);

$composer->scene('Intro')
    ->duration(3000)
    ->background('#050816')
    ->image($imageAsset)
    ->cover()
    ->zIndex(0);

$composer->scene('Intro')
    ->text('Laravel video primitives')
    ->position(80, 220)
    ->size(920, 260)
    ->fontSize(72)
    ->stroke('#000000', 4)
    ->zIndex(1);

$composer->scene('Demo')
    ->duration(6000)
    ->video($videoAsset)
    ->fill()
    ->trim(0, 6000);

$composer->videoTrack('Badge')
    ->text('Built programmatically')
    ->position(90, 1540)
    ->size(900, 120)
    ->fontSize(42)
    ->stroke('#000000', 3);

$composer->audioTrack('Music')
    ->volume(0.5)
    ->clip($musicAsset)
    ->start(0)
    ->duration(9000)
    ->volume(0.4);

$composer->subtitles('Captions')
    ->style(StyleData::subtitle())
    ->entry(0, 1800, 'This video was composed from Laravel.')
    ->entry(1800, 3600, 'Scenes, layers, tracks, and captions are reusable primitives.');

$project = $composer->save();
```

## Generate the showcase video

A demo command exists:

```bash
php artisan video:composition-showcase
```

This generates fal.ai images and composes a project document.

To also render the final MP4 synchronously:

```bash
php artisan video:composition-showcase --render
```

The generated showcase MP4 was copied to:

```txt
.ai/video-composition-showcase.mp4
```

## Rendering a composed project

The composer only creates the project document. Rendering still uses the existing render pipeline:

```php
use App\Enums\RenderStatus;
use App\Jobs\RenderProject;
use App\Models\Render;

$render = Render::create([
    'project_id' => $project->id,
    'user_id' => $project->user_id,
    'status' => RenderStatus::Queued,
    'progress' => 0,
]);

RenderProject::dispatch($render);
```

For synchronous local testing:

```php
(new RenderProject($render))->handle(app(\App\Services\FFmpegService::class));
```

## Important notes

- The composition layer currently persists into the existing JSON columns.
- This is Phase 1: a strong backend API without changing the database schema.
- Renderer support is not yet equal to every property in the schema. Phase 2 should align FFmpeg behavior with all primitives, especially rotation, richer opacity, fades, text alignment, and exact media fitting.
