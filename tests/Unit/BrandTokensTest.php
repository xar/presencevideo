<?php

use App\Models\BrandKit;
use App\Services\FFmpegService;
use App\Support\BrandTokens;

function brandKitStub(): BrandKit
{
    return new BrandKit([
        'colors' => ['primary' => '#112233', 'text' => '#ffffff', 'caption_highlight' => '#ffd166'],
        'fonts' => ['display' => 'Montserrat, sans-serif'],
    ]);
}

it('recognises brand tokens and nothing else', function () {
    expect(BrandTokens::isToken('brand.primary'))->toBeTrue()
        ->and(BrandTokens::isToken('brand.'))->toBeFalse()
        ->and(BrandTokens::isToken('#ffffff'))->toBeFalse()
        ->and(BrandTokens::isToken(null))->toBeFalse()
        ->and(BrandTokens::isToken(12))->toBeFalse();
});

it('resolves colour and font tokens against the kit', function () {
    $kit = brandKitStub();

    expect(BrandTokens::resolveColor('brand.primary', $kit->colors))->toBe('#112233')
        ->and(BrandTokens::resolveFont('brand.display', $kit->fonts))->toBe('Montserrat, sans-serif');
});

it('falls back for unknown roles and a missing kit', function () {
    expect(BrandTokens::resolveColor('brand.nope', ['primary' => '#112233']))->toBe(BrandTokens::FALLBACK_COLOR)
        ->and(BrandTokens::resolveColor('brand.primary', null))->toBe(BrandTokens::FALLBACK_COLOR)
        ->and(BrandTokens::resolveColor('brand.primary', ['primary' => '']))->toBe(BrandTokens::FALLBACK_COLOR)
        ->and(BrandTokens::resolveFont('brand.body', null))->toBe(BrandTokens::FALLBACK_FONT);
});

it('passes non-token values through untouched, including non-canonical ones', function () {
    expect(BrandTokens::resolveColor('#abcdef', ['primary' => '#112233']))->toBe('#abcdef')
        ->and(BrandTokens::resolveColor('transparent', null))->toBe('transparent')
        ->and(BrandTokens::resolveColor(null, null))->toBeNull()
        ->and(BrandTokens::resolveFont('Comic Sans', null))->toBe('Comic Sans');
});

it('resolves every tokenised field on scenes, video tracks and subtitle tracks', function () {
    $project = BrandTokens::resolveProjectArrays([
        'scenes' => [[
            'id' => 's1',
            'background_color' => 'brand.primary',
            'layers' => [
                ['type' => 'text', 'text' => 'hi', 'font_color' => 'brand.text', 'font_family' => 'brand.display', 'stroke_color' => 'brand.primary', 'background_color' => '#000000'],
                ['type' => 'shape', 'shape' => 'rect', 'fill_color' => 'brand.primary', 'border_color' => 'brand.missing'],
                ['type' => 'effect', 'custom' => 'brand.primary'],
            ],
        ]],
        'video_tracks' => [[
            'id' => 't1',
            'clips' => [['type' => 'text', 'text' => 'x', 'font_color' => 'brand.primary']],
        ]],
        'subtitle_tracks' => [[
            'id' => 'sub',
            'style' => ['font_color' => 'brand.text', 'highlight_color' => 'brand.caption_highlight', 'font_family' => 'brand.display', 'stroke_color' => '#000000'],
            'entries' => [],
        ]],
    ], brandKitStub());

    $layers = $project['scenes'][0]['layers'];

    expect($project['scenes'][0]['background_color'])->toBe('#112233')
        ->and($layers[0]['font_color'])->toBe('#ffffff')
        ->and($layers[0]['font_family'])->toBe('Montserrat, sans-serif')
        ->and($layers[0]['stroke_color'])->toBe('#112233')
        ->and($layers[0]['background_color'])->toBe('#000000')
        ->and($layers[1]['fill_color'])->toBe('#112233')
        ->and($layers[1]['border_color'])->toBe(BrandTokens::FALLBACK_COLOR)
        ->and($layers[1]['shape'])->toBe('rect')
        ->and($layers[2])->toBe(['type' => 'effect', 'custom' => 'brand.primary'])
        ->and($project['video_tracks'][0]['clips'][0]['font_color'])->toBe('#112233')
        ->and($project['subtitle_tracks'][0]['style'])->toBe([
            'font_color' => '#ffffff',
            'highlight_color' => '#ffd166',
            'font_family' => 'Montserrat, sans-serif',
            'stroke_color' => '#000000',
        ]);
});

it('feeds the legacy ffmpeg filtergraph resolved hex colours instead of tokens', function () {
    $scene = BrandTokens::resolveScene([
        'id' => 'scene-1',
        'duration_ms' => 5000,
        'background_color' => 'brand.primary',
        'layers' => [['type' => 'text', 'text' => 'hi', 'font_color' => 'brand.text']],
    ], brandKitStub());

    $graph = (new FFmpegService)->buildSceneFilterGraph(
        $scene,
        1920,
        1080,
        30,
        fn (mixed $id): ?array => ['path' => "/media/asset-{$id}.mp4", 'duration_ms' => 10000],
        fn (?string $family, ?string $weight): ?string => null,
    );

    $filters = implode(';', $graph['filters']);

    expect($filters)->toContain('color=c=0x112233:s=1920x1080:d=5.000000:r=30[base]')
        ->and($filters)->not->toContain('brand.');
});
