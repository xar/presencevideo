# Video Composition Primitives

The current Laravel video model is a good rendering foundation, but project manipulation should not remain raw JSON array assembly. We need a backend composition layer that lets PHP code create complete videos safely and expressively.

## Current baseline

Projects currently store `scenes`, `audio_tracks`, `video_tracks`, and `subtitle_tracks` as JSON columns. Rendering is handled by `RenderProject` and `FFmpegService`, supporting scenes, image/video/text layers, audio tracks, overlay video tracks, subtitles, asset validation, and FFmpeg output.

## Main gap

Programmatic creation currently requires manually building deeply nested arrays. That is flexible, but not composable, not type-oriented, and easy to break. We need reusable primitives for scenes, layers, tracks, subtitles, timing, layout, and styles.

## Target API

```php
ProjectComposer::for($project)
    ->resolution(1080, 1920)
    ->fps(30)
    ->scene('intro')
        ->duration(3000)
        ->background('#000000')
        ->text('Hook text')->center()->fontSize(72)->stroke('#000000', 4)
        ->image($asset)->cover()
    ->scene('demo')
        ->duration(6000)
        ->video($videoAsset)->fill()->trim(0, 6000)
    ->audioTrack('Music')
        ->clip($musicAsset)->start(0)->duration(9000)->volume(0.4)
    ->subtitles('Captions')
        ->entry(0, 1800, 'First line')
        ->entry(1800, 3600, 'Second line')
    ->save();
```

## Phase 1

Keep the existing JSON columns and add a domain layer above them:

- `ProjectComposer`
- scene, layer, audio, video, and subtitle builders
- DTO/value objects with `toArray()` / `fromArray()` style behavior
- timeline helpers
- layout helpers such as fill, fit, cover, contain, center, safe area, margins
- style presets for headlines, captions, subtitles, and lower-thirds
- tests proving a complete video can be created programmatically

## Phase 2

Align renderer behavior with the canonical schema: opacity, rotation, video trimming, image duration, text alignment, font family, fade in/out, backgrounds, and richer timing.

## Phase 3

Build reusable templates: short-form hook, narration slideshow, product demo, podcast clip, before/after, captioned video, and branded outro.

## Phase 4

Optionally normalize scenes/layers/tracks/clips into database tables if JSON stops being sufficient. The first goal is a strong composition API, not a schema rewrite.
