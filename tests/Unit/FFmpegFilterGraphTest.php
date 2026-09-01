<?php

use App\Services\FFmpegService;

/**
 * Resolver stub so the filtergraph builders never touch the database.
 *
 * @return callable(mixed): (array{path: string, duration_ms: int|null}|null)
 */
function assetResolverStub(?int $durationMs = 10000): callable
{
    return fn (mixed $id): ?array => $id === 0
        ? null
        : ['path' => "/media/asset-{$id}.mp4", 'duration_ms' => $durationMs];
}

/**
 * Deterministic font resolver stub (the real one probes the filesystem).
 *
 * @return callable(string|null, string|null): (string|null)
 */
function fontResolverStub(): callable
{
    return function (?string $family, ?string $weight): ?string {
        if ($family === null && $weight !== 'bold') {
            return null;
        }

        $bold = $weight === 'bold' ? '-Bold' : '';

        return '/fonts/'.($family ?? 'Default').$bold.'.ttf';
    };
}

/**
 * @param  array<int, array<string, mixed>>  $layers
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function scene(array $layers = [], array $overrides = []): array
{
    return array_merge([
        'id' => 'scene-1',
        'duration_ms' => 5000,
        'layers' => $layers,
    ], $overrides);
}

/**
 * @param  array<string, mixed>  $scene
 */
function sceneGraph(array $scene): string
{
    $graph = (new FFmpegService)->buildSceneFilterGraph(
        $scene,
        1920,
        1080,
        30,
        assetResolverStub(),
        fontResolverStub(),
    );

    return implode(';', $graph['filters']);
}

it('uses black as the scene background when none is set', function () {
    expect(sceneGraph(scene([['type' => 'text', 'text' => 'hi']])))
        ->toContain('color=c=black:s=1920x1080:d=5.000000:r=30[base]');
});

it('uses the scene background colour converted to an ffmpeg colour', function () {
    $graph = sceneGraph(scene(
        [['type' => 'text', 'text' => 'hi']],
        ['background_color' => '#112233'],
    ));

    expect($graph)->toContain('color=c=0x112233:s=1920x1080:d=5.000000:r=30[base]');
});

it('falls back to black for a transparent or empty background colour', function () {
    expect(sceneGraph(scene([['type' => 'text', 'text' => 'x']], ['background_color' => 'transparent'])))
        ->toContain('color=c=black:')
        ->and(sceneGraph(scene([['type' => 'text', 'text' => 'x']], ['background_color' => '  '])))
        ->toContain('color=c=black:');
});

it('orders layers by z_index', function () {
    $graph = sceneGraph(scene([
        ['type' => 'text', 'text' => 'Top', 'z_index' => 5],
        ['type' => 'text', 'text' => 'Bottom', 'z_index' => 1],
    ]));

    expect(strpos($graph, 'Bottom'))->toBeLessThan(strpos($graph, 'Top'));
});

it('scales and overlays an image layer without extra filters by default', function () {
    $graph = sceneGraph(scene([[
        'type' => 'image',
        'asset_id' => 7,
        'x' => 10,
        'y' => 20,
        'width' => 640,
        'height' => 360,
    ]]));

    expect($graph)->toContain('[0:v]scale=640:360,loop=loop=-1:size=1:start=0[layer0]')
        ->and($graph)->toContain('[base][layer0]overlay=10:20:shortest=1[stage0]')
        ->and($graph)->not->toContain('colorchannelmixer')
        ->and($graph)->not->toContain('rotate=');
});

it('applies opacity to media layers via colorchannelmixer', function () {
    $graph = sceneGraph(scene([[
        'type' => 'image',
        'asset_id' => 7,
        'width' => 100,
        'height' => 100,
        'opacity' => 0.5,
    ]]));

    expect($graph)->toContain('format=rgba,colorchannelmixer=aa=0.500000[layer0]');
});

it('rotates a layer with a transparent fill and re-centres the overlay', function () {
    $graph = sceneGraph(scene([[
        'type' => 'image',
        'asset_id' => 7,
        'x' => 100,
        'y' => 100,
        'width' => 200,
        'height' => 100,
        'rotation' => 90,
    ]]));

    // 90deg swaps the bounding box: 200x100 -> 100x200.
    expect($graph)->toContain('format=rgba,rotate=a=1.570796:c=none:ow=100:oh=200[layer0]')
        // x += (200-100)/2 = +50, y += (100-200)/2 = -50
        ->and($graph)->toContain('[base][layer0]overlay=150:50:shortest=1[stage0]');
});

it('combines opacity and rotation in a single chain', function () {
    $graph = sceneGraph(scene([[
        'type' => 'image',
        'asset_id' => 7,
        'width' => 100,
        'height' => 100,
        'opacity' => 0.25,
        'rotation' => 45,
    ]]));

    expect($graph)->toContain('format=rgba,colorchannelmixer=aa=0.250000,rotate=a=0.785398:c=none:ow=141:oh=141[layer0]');
});

it('trims a video layer before scaling', function () {
    $graph = sceneGraph(scene([[
        'type' => 'video',
        'asset_id' => 7,
        'width' => 320,
        'height' => 180,
        'trim_start_ms' => 1500,
        'trim_end_ms' => 4000,
    ]]));

    expect($graph)->toContain('[0:v]trim=start=1.500000:end=4.000000,setpts=PTS-STARTPTS,tpad=stop=-1:stop_mode=clone,scale=320:180,setpts=PTS-STARTPTS[layer0]');
});

it('omits the trim end when trim_end_ms is null', function () {
    $graph = sceneGraph(scene([[
        'type' => 'video',
        'asset_id' => 7,
        'width' => 320,
        'height' => 180,
        'trim_start_ms' => 2000,
        'trim_end_ms' => null,
    ]]));

    expect($graph)->toContain('[0:v]trim=start=2.000000,setpts=PTS-STARTPTS,tpad=stop=-1:stop_mode=clone,scale=320:180')
        ->and($graph)->not->toContain('end=');
});

it('does not emit a trim filter when there is nothing to trim', function () {
    $graph = sceneGraph(scene([[
        'type' => 'video',
        'asset_id' => 7,
        'width' => 320,
        'height' => 180,
        'trim_start_ms' => 0,
    ]]));

    expect($graph)->not->toContain('trim=');
});

it('ignores trim on image layers', function () {
    $graph = sceneGraph(scene([[
        'type' => 'image',
        'asset_id' => 7,
        'width' => 320,
        'height' => 180,
        'trim_start_ms' => 2000,
    ]]));

    expect($graph)->not->toContain('trim=');
});

it('skips layers whose asset cannot be resolved', function () {
    $graph = (new FFmpegService)->buildSceneFilterGraph(
        scene([
            ['type' => 'image', 'asset_id' => 0],
            ['type' => 'image'],
        ]),
        1920,
        1080,
        30,
        assetResolverStub(),
        fontResolverStub(),
    );

    expect($graph['inputs'])->toBe([])
        ->and($graph['output'])->toBe('[base]')
        ->and($graph['filters'])->toHaveCount(1);
});

it('collects one ffmpeg input per resolved media layer', function () {
    $graph = (new FFmpegService)->buildSceneFilterGraph(
        scene([
            ['type' => 'image', 'asset_id' => 1],
            ['type' => 'text', 'text' => 'between'],
            ['type' => 'video', 'asset_id' => 2],
        ]),
        1920,
        1080,
        30,
        assetResolverStub(),
        fontResolverStub(),
    );

    expect($graph['inputs'])->toBe(['/media/asset-1.mp4', '/media/asset-2.mp4'])
        ->and($graph['output'])->toBe('[stage2]');
});

it('centres text within the layer box by default', function () {
    $graph = sceneGraph(scene([[
        'type' => 'text',
        'text' => 'Hello',
        'x' => 100,
        'y' => 200,
        'width' => 400,
        'height' => 100,
        'font_size' => 64,
        'font_color' => '#ff0000',
    ]]));

    expect($graph)->toContain("text='Hello'")
        ->and($graph)->toContain('fontsize=64')
        ->and($graph)->toContain('fontcolor=0xff0000')
        ->and($graph)->toContain('x=(300-text_w/2)')
        ->and($graph)->toContain('y=(250-text_h/2)')
        ->and($graph)->toContain('[base]drawtext=');
});

it('left aligns text inside the layer box with padding', function () {
    $graph = sceneGraph(scene([[
        'type' => 'text',
        'text' => 'Hi',
        'x' => 100,
        'width' => 400,
        'text_align' => 'left',
        'padding' => 20,
    ]]));

    expect($graph)->toContain('x=(120)');
});

it('right aligns text inside the layer box with padding', function () {
    $graph = sceneGraph(scene([[
        'type' => 'text',
        'text' => 'Hi',
        'x' => 100,
        'width' => 400,
        'text_align' => 'right',
        'padding' => 20,
    ]]));

    expect($graph)->toContain('x=(480-text_w)');
});

it('draws a background box using the padding as box border width', function () {
    $graph = sceneGraph(scene([[
        'type' => 'text',
        'text' => 'Boxed',
        'background_color' => '#00000080',
        'padding' => 16,
    ]]));

    expect($graph)->toContain('box=1:boxcolor=0x00000080:boxborderw=16');
});

it('omits the box when the text background is transparent or unset', function () {
    expect(sceneGraph(scene([['type' => 'text', 'text' => 'x']])))->not->toContain('box=1')
        ->and(sceneGraph(scene([['type' => 'text', 'text' => 'x', 'background_color' => 'transparent']])))
        ->not->toContain('box=1');
});

it('applies the bold font file and the family font file', function () {
    $bold = sceneGraph(scene([[
        'type' => 'text',
        'text' => 'Bold',
        'font_family' => 'Impact',
        'font_weight' => 'bold',
    ]]));

    expect($bold)->toContain("drawtext=fontfile='/fonts/Impact-Bold.ttf':text='Bold'");

    $regular = sceneGraph(scene([[
        'type' => 'text',
        'text' => 'Plain',
        'font_family' => 'Georgia',
    ]]));

    expect($regular)->toContain("fontfile='/fonts/Georgia.ttf'");
});

it('omits fontfile when no font can be resolved', function () {
    $graph = sceneGraph(scene([['type' => 'text', 'text' => 'Plain']]));

    expect($graph)->not->toContain('fontfile=')
        ->and($graph)->toContain("drawtext=text='Plain'");
});

it('applies stroke and alpha to text layers', function () {
    $graph = sceneGraph(scene([[
        'type' => 'text',
        'text' => 'Stroked',
        'stroke_width' => 4,
        'stroke_color' => '#000000',
        'opacity' => 0.4,
    ]]));

    expect($graph)->toContain('borderw=4:bordercolor=0x000000')
        ->and($graph)->toContain('alpha=0.400000');
});

it('escapes drawtext special characters', function () {
    $graph = sceneGraph(scene([[
        'type' => 'text',
        'text' => "It's 100% done: really\\here",
    ]]));

    // A literal quote closes the quoted value, escapes the quote and reopens it.
    expect($graph)->toContain("text='It'\\''s 100%% done\\: really\\\\here'");
});

it('resolves real font files only when they exist on this machine', function () {
    $graph = (new FFmpegService)->buildSceneFilterGraph(
        scene([['type' => 'text', 'text' => 'Default font']]),
        1920,
        1080,
        30,
        assetResolverStub(),
    );

    $drawtext = implode(';', $graph['filters']);

    // Either no font was found (silent fallback) or the referenced file exists.
    if (preg_match("/fontfile='([^']+)'/", $drawtext, $matches)) {
        expect(is_file(str_replace(['\\:', '\\\\'], [':', '\\'], $matches[1])))->toBeTrue();
    } else {
        expect($drawtext)->not->toContain('fontfile=');
    }
});

/**
 * @param  array<int, array<string, mixed>>  $tracks
 */
function audioGraph(array $tracks): array
{
    return (new FFmpegService)->buildAudioMixFilter($tracks, assetResolverStub());
}

it('builds an audio clip chain with trim, delay and combined volume', function () {
    $graph = audioGraph([[
        'volume' => 0.5,
        'clips' => [[
            'asset_id' => 3,
            'start_ms' => 2000,
            'duration_ms' => 4000,
            'trim_start_ms' => 500,
            'volume' => 0.5,
        ]],
    ]]);

    expect($graph['inputs'])->toBe(['/media/asset-3.mp4'])
        ->and($graph['output'])->toBe('[aout]')
        ->and($graph['filters'][0])->toBe(
            '[0:a]atrim=start=0.500000:duration=4.000000,asetpts=PTS-STARTPTS,adelay=2000|2000,volume=0.250000[a0]'
        )
        ->and($graph['filters'][1])->toBe('[a0]amix=inputs=1:duration=longest[aout]');
});

it('skips muted audio tracks entirely', function () {
    $graph = audioGraph([
        ['muted' => true, 'clips' => [['asset_id' => 1, 'duration_ms' => 1000]]],
        ['clips' => [['asset_id' => 2, 'duration_ms' => 1000]]],
    ]);

    expect($graph['inputs'])->toBe(['/media/asset-2.mp4'])
        ->and($graph['filters'])->toHaveCount(2);
});

it('returns a null output when no audio clips are usable', function () {
    $graph = audioGraph([
        ['muted' => true, 'clips' => [['asset_id' => 1]]],
        ['clips' => [['start_ms' => 0]]],
        ['clips' => [['asset_id' => 0]]],
    ]);

    expect($graph['output'])->toBeNull()
        ->and($graph['filters'])->toBe([])
        ->and($graph['inputs'])->toBe([]);
});

it('applies fade in and fade out after the trim and before the delay', function () {
    $graph = audioGraph([[
        'clips' => [[
            'asset_id' => 3,
            'start_ms' => 1000,
            'duration_ms' => 6000,
            'fade_in_ms' => 500,
            'fade_out_ms' => 1500,
        ]],
    ]]);

    expect($graph['filters'][0])->toBe(
        '[0:a]atrim=start=0.000000:duration=6.000000,asetpts=PTS-STARTPTS,'
        .'afade=t=in:st=0:d=0.500000,afade=t=out:st=4.500000:d=1.500000,'
        .'adelay=1000|1000,volume=1.000000[a0]'
    );
});

it('clamps fades longer than the clip duration', function () {
    $graph = audioGraph([[
        'clips' => [[
            'asset_id' => 3,
            'duration_ms' => 1000,
            'fade_in_ms' => 5000,
            'fade_out_ms' => 5000,
        ]],
    ]]);

    expect($graph['filters'][0])->toContain('afade=t=in:st=0:d=1.000000')
        ->and($graph['filters'][0])->toContain('afade=t=out:st=0.000000:d=1.000000');
});

it('falls back to the asset duration when the clip has none', function () {
    $graph = audioGraph([['clips' => [['asset_id' => 3]]]]);

    expect($graph['filters'][0])->toContain('atrim=start=0.000000:duration=10.000000');
});

it('mixes clips from multiple tracks', function () {
    $graph = audioGraph([
        ['clips' => [['asset_id' => 1, 'duration_ms' => 1000], ['asset_id' => 2, 'duration_ms' => 1000]]],
        ['clips' => [['asset_id' => 3, 'duration_ms' => 1000]]],
    ]);

    expect($graph['inputs'])->toHaveCount(3)
        ->and(end($graph['filters']))->toBe('[a0][a1][a2]amix=inputs=3:duration=longest[aout]');
});

/**
 * @param  array<int, array<string, mixed>>  $tracks
 */
function overlayGraph(array $tracks): array
{
    return (new FFmpegService)->buildOverlayFilterGraph($tracks, assetResolverStub(), fontResolverStub());
}

it('trims overlay video clips and applies opacity', function () {
    $graph = overlayGraph([[
        'clips' => [[
            'asset_id' => 4,
            'start_ms' => 1000,
            'duration_ms' => 2000,
            'trim_start_ms' => 3000,
            'x' => 40,
            'y' => 50,
            'width' => 320,
            'height' => 180,
            'opacity' => 0.8,
        ]],
    ]]);

    expect($graph['inputs'])->toBe(['/media/asset-4.mp4'])
        ->and($graph['filters'][0])->toBe(
            '[1:v]trim=start=3.000000,setpts=PTS-STARTPTS,scale=320:180,setpts=PTS-STARTPTS,'
            .'format=rgba,colorchannelmixer=aa=0.800000[scaled1]'
        )
        ->and($graph['filters'][1])->toBe("[0:v][scaled1]overlay=40:50:enable='between(t,1.000000,3.000000)'[out1]")
        ->and($graph['output'])->toBe('[out1]');
});

it('skips hidden overlay tracks', function () {
    $graph = overlayGraph([
        ['visible' => false, 'clips' => [['asset_id' => 4]]],
        ['visible' => true, 'clips' => [['type' => 'text', 'text' => 'Shown']]],
    ]);

    expect(implode(';', $graph['filters']))->toContain('Shown')
        ->and($graph['inputs'])->toBe([]);
});

it('applies alignment and bold fonts to overlay text clips', function () {
    $graph = overlayGraph([[
        'clips' => [[
            'type' => 'text',
            'text' => 'Lower third',
            'x' => 100,
            'y' => 800,
            'width' => 600,
            'height' => 120,
            'text_align' => 'left',
            'font_weight' => 'bold',
            'font_family' => 'Arial',
            'start_ms' => 0,
            'duration_ms' => 3000,
        ]],
    ]]);

    $filter = $graph['filters'][0];

    expect($filter)->toContain("fontfile='/fonts/Arial-Bold.ttf'")
        ->and($filter)->toContain('x=(112)')
        ->and($filter)->toContain('y=(860-text_h/2)')
        ->and($filter)->toContain('box=1:boxcolor=0x00000080:boxborderw=12')
        ->and($filter)->toContain("enable='between(t,0.000000,3.000000)'");
});

it('returns an empty overlay graph when there is nothing to overlay', function () {
    $graph = overlayGraph([['clips' => []]]);

    expect($graph['filters'])->toBe([])
        ->and($graph['output'])->toBe('[0:v]');
});

/*
|--------------------------------------------------------------------------
| Speed control
|--------------------------------------------------------------------------
*/

it('emits no speed filters for a scene video layer at the default speed', function () {
    $graph = sceneGraph(scene([[
        'type' => 'video',
        'asset_id' => 5,
        'width' => 640,
        'height' => 360,
    ]]));

    expect($graph)->toContain('[0:v]tpad=stop=-1:stop_mode=clone,scale=640:360,setpts=PTS-STARTPTS[layer0]')
        ->and($graph)->not->toContain('setpts=PTS/');
});

it('holds the last frame of every scene video layer so a short clip cannot truncate the scene', function () {
    expect(sceneGraph(scene([['type' => 'video', 'asset_id' => 5]])))
        ->toContain('tpad=stop=-1:stop_mode=clone');
});

it('never pads an image layer', function () {
    expect(sceneGraph(scene([['type' => 'image', 'asset_id' => 5]])))
        ->not->toContain('tpad=');
});

it('treats an explicit speed of 1 as neutral', function () {
    expect(sceneGraph(scene([[
        'type' => 'video',
        'asset_id' => 5,
        'width' => 640,
        'height' => 360,
        'speed' => 1,
    ]])))->not->toContain('setpts=PTS/');
});

it('speeds up a scene video layer after the trim and holds the last frame', function () {
    $graph = sceneGraph(scene([[
        'type' => 'video',
        'asset_id' => 5,
        'width' => 640,
        'height' => 360,
        'trim_start_ms' => 2000,
        'speed' => 2,
    ]]));

    expect($graph)->toContain(
        '[0:v]trim=start=2.000000,setpts=PTS-STARTPTS,setpts=PTS/2.000000,'
        .'tpad=stop=-1:stop_mode=clone,scale=640:360,setpts=PTS-STARTPTS[layer0]'
    );
});

it('slows a scene video layer down and still pads the tail', function () {
    $graph = sceneGraph(scene([[
        'type' => 'video',
        'asset_id' => 5,
        'width' => 640,
        'height' => 360,
        'speed' => 0.5,
    ]]));

    expect($graph)->toContain(
        '[0:v]setpts=PTS/0.500000,tpad=stop=-1:stop_mode=clone,scale=640:360,setpts=PTS-STARTPTS[layer0]'
    );
});

it('clamps out-of-range layer speeds to the supported bounds', function () {
    expect(sceneGraph(scene([['type' => 'video', 'asset_id' => 5, 'speed' => 99]])))
        ->toContain('setpts=PTS/4.000000')
        ->and(sceneGraph(scene([['type' => 'video', 'asset_id' => 5, 'speed' => 0.01]])))
        ->toContain('setpts=PTS/0.250000');
});

it('ignores speed on image layers', function () {
    expect(sceneGraph(scene([[
        'type' => 'image',
        'asset_id' => 5,
        'width' => 100,
        'height' => 100,
        'speed' => 2,
    ]])))->not->toContain('setpts=PTS/');
});

it('retimes overlay clip video after the trim while keeping the enable window', function () {
    $graph = overlayGraph([[
        'clips' => [[
            'asset_id' => 4,
            'start_ms' => 1000,
            'duration_ms' => 2000,
            'trim_start_ms' => 3000,
            'width' => 320,
            'height' => 180,
            'speed' => 2,
        ]],
    ]]);

    expect($graph['filters'][0])->toBe(
        '[1:v]trim=start=3.000000,setpts=PTS-STARTPTS,setpts=PTS/2.000000,'
        .'scale=320:180,setpts=PTS-STARTPTS[scaled1]'
    )
        ->and($graph['filters'][1])->toContain("enable='between(t,1.000000,3.000000)'");
});

it('emits no setpts for an overlay clip at the default speed', function () {
    $graph = overlayGraph([[
        'clips' => [['asset_id' => 4, 'start_ms' => 0, 'duration_ms' => 1000]],
    ]]);

    expect($graph['filters'][0])->not->toContain('setpts=PTS/');
});

/**
 * @param  array<int, array<string, mixed>>  $layers
 * @return array<int, string>
 */
function sceneAudioFilters(array $layers): array
{
    return (new FFmpegService)->buildSceneAudioFilter(
        [scene($layers)],
        30,
        assetResolverStub(),
    )['filters'];
}

it('leaves scene audio untouched at the default speed', function () {
    $filters = sceneAudioFilters([['type' => 'video', 'asset_id' => 5]]);

    expect($filters[0])->toBe('[0:a]atrim=0:5.000000,asetpts=PTS-STARTPTS,adelay=0|0[a0]');
});

it('retimes scene audio with a single atempo stage inside the native range', function () {
    $filters = sceneAudioFilters([['type' => 'video', 'asset_id' => 5, 'speed' => 1.5]]);

    expect($filters[0])->toBe(
        '[0:a]atempo=1.500000,atrim=0:5.000000,asetpts=PTS-STARTPTS,adelay=0|0[a0]'
    );
});

it('chains atempo stages for speeds above 2x', function () {
    expect(sceneAudioFilters([['type' => 'video', 'asset_id' => 5, 'speed' => 4]])[0])
        ->toStartWith('[0:a]atempo=2.000000,atempo=2.000000,atrim=');
});

it('chains atempo stages for speeds below 0.5x', function () {
    expect(sceneAudioFilters([['type' => 'video', 'asset_id' => 5, 'speed' => 0.25]])[0])
        ->toStartWith('[0:a]atempo=0.500000,atempo=0.500000,atrim=');
});

it('chains a partial atempo stage for 3x', function () {
    expect(sceneAudioFilters([['type' => 'video', 'asset_id' => 5, 'speed' => 3]])[0])
        ->toStartWith('[0:a]atempo=2.000000,atempo=1.500000,atrim=');
});

it('offsets scene audio by the layer trim so it matches the trimmed video', function () {
    $filters = sceneAudioFilters([[
        'type' => 'video',
        'asset_id' => 5,
        'trim_start_ms' => 1500,
        'trim_end_ms' => 4000,
    ]]);

    expect($filters[0])->toBe(
        '[0:a]atrim=start=1.500000:end=4.000000,asetpts=PTS-STARTPTS,'
        .'atrim=0:5.000000,asetpts=PTS-STARTPTS,adelay=0|0[a0]'
    );
});

it('omits the audio trim end when trim_end_ms is null', function () {
    $filters = sceneAudioFilters([[
        'type' => 'video',
        'asset_id' => 5,
        'trim_start_ms' => 2000,
        'trim_end_ms' => null,
    ]]);

    expect($filters[0])->toStartWith('[0:a]atrim=start=2.000000,asetpts=PTS-STARTPTS,atrim=0:5.000000');
});

it('trims scene audio on source time before retiming it', function () {
    $filters = sceneAudioFilters([[
        'type' => 'video',
        'asset_id' => 5,
        'trim_start_ms' => 1000,
        'trim_end_ms' => 3000,
        'speed' => 2,
    ]]);

    expect($filters[0])->toBe(
        '[0:a]atrim=start=1.000000:end=3.000000,asetpts=PTS-STARTPTS,atempo=2.000000,'
        .'atrim=0:5.000000,asetpts=PTS-STARTPTS,adelay=0|0[a0]'
    );
});

it('applies the layer volume to scene audio', function () {
    expect(sceneAudioFilters([['type' => 'video', 'asset_id' => 5, 'volume' => 0.4]])[0])
        ->toBe('[0:a]atrim=0:5.000000,asetpts=PTS-STARTPTS,adelay=0|0,volume=0.400000[a0]');
});

it('emits no volume filter for a neutral or missing layer volume', function () {
    expect(sceneAudioFilters([['type' => 'video', 'asset_id' => 5, 'volume' => 1]])[0])
        ->not->toContain('volume=')
        ->and(sceneAudioFilters([['type' => 'video', 'asset_id' => 5]])[0])
        ->not->toContain('volume=');
});

it('clamps out-of-range layer volumes', function () {
    expect(sceneAudioFilters([['type' => 'video', 'asset_id' => 5, 'volume' => 5]])[0])
        ->not->toContain('volume=')
        ->and(sceneAudioFilters([['type' => 'video', 'asset_id' => 5, 'volume' => -3]])[0])
        ->toContain('volume=0.000000');
});

it('drops muted video layers from the scene audio mix', function () {
    $graph = (new FFmpegService)->buildSceneAudioFilter(
        [scene([
            ['type' => 'video', 'asset_id' => 5, 'muted' => true],
            ['type' => 'video', 'asset_id' => 6],
        ])],
        30,
        assetResolverStub(),
    );

    expect($graph['inputs'])->toBe(['/media/asset-6.mp4'])
        ->and($graph['filters'][0])->toStartWith('[0:a]atrim=0:5.000000');
});

it('returns a null audio output when every video layer is muted', function () {
    $graph = (new FFmpegService)->buildSceneAudioFilter(
        [scene([['type' => 'video', 'asset_id' => 5, 'muted' => true]])],
        30,
        assetResolverStub(),
    );

    expect($graph['output'])->toBeNull()
        ->and($graph['inputs'])->toBe([]);
});

/*
|--------------------------------------------------------------------------
| Colour adjustments
|--------------------------------------------------------------------------
*/

it('emits no eq filter when adjustments are absent or neutral', function () {
    expect(sceneGraph(scene([['type' => 'image', 'asset_id' => 5]])))
        ->not->toContain('eq=')
        ->and(sceneGraph(scene([[
            'type' => 'image',
            'asset_id' => 5,
            'adjustments' => ['brightness' => 0, 'contrast' => 1, 'saturation' => 1],
        ]])))->not->toContain('eq=');
});

it('applies colour adjustments to an image layer after the scale', function () {
    $graph = sceneGraph(scene([[
        'type' => 'image',
        'asset_id' => 5,
        'width' => 100,
        'height' => 100,
        'adjustments' => ['brightness' => 0.2, 'contrast' => 1.3, 'saturation' => 0.5],
    ]]));

    expect($graph)->toContain(
        '[0:v]scale=100:100,loop=loop=-1:size=1:start=0,'
        .'eq=brightness=0.200000:contrast=1.300000:saturation=0.500000[layer0]'
    );
});

it('fills neutral values in for partial adjustments', function () {
    expect(sceneGraph(scene([[
        'type' => 'image',
        'asset_id' => 5,
        'adjustments' => ['saturation' => 1.8],
    ]])))->toContain('eq=brightness=0.000000:contrast=1.000000:saturation=1.800000');
});

it('places colour adjustments before the opacity and rotation filters', function () {
    $graph = sceneGraph(scene([[
        'type' => 'video',
        'asset_id' => 5,
        'width' => 100,
        'height' => 100,
        'opacity' => 0.5,
        'rotation' => 45,
        'adjustments' => ['contrast' => 1.5],
    ]]));

    expect(strpos($graph, 'eq='))->toBeLessThan(strpos($graph, 'colorchannelmixer'))
        ->and(strpos($graph, 'eq='))->toBeLessThan(strpos($graph, 'rotate='));
});

it('clamps out-of-range adjustment values', function () {
    expect(sceneGraph(scene([[
        'type' => 'image',
        'asset_id' => 5,
        'adjustments' => ['brightness' => 9, 'contrast' => -5, 'saturation' => 42],
    ]])))->toContain('eq=brightness=1.000000:contrast=0.000000:saturation=2.000000');
});

/**
 * Full graph (not just the filter string) so tests can assert on input indexes.
 *
 * @param  array<string, mixed>  $scene
 * @return array{filters: array<int, string>, inputs: array<int, string>, output: string}
 */
function sceneGraphArray(array $scene): array
{
    return (new FFmpegService)->buildSceneFilterGraph(
        $scene,
        1920,
        1080,
        30,
        assetResolverStub(),
        fontResolverStub(),
    );
}

/**
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function shapeLayer(array $overrides = []): array
{
    return array_merge([
        'type' => 'shape',
        'shape' => 'rectangle',
        'fill_color' => '#ff0000',
        'x' => 100,
        'y' => 50,
        'width' => 400,
        'height' => 200,
    ], $overrides);
}

it('renders a filled rectangle shape from a colour source with no input file', function () {
    $graph = sceneGraphArray(scene([shapeLayer()]));
    $filters = implode(';', $graph['filters']);

    expect($filters)->toContain('color=c=0xff0000:s=400x200:d=5.000000:r=30[shape0]')
        ->and($filters)->toContain('[base][shape0]overlay=100:50:shortest=1[stage0]')
        ->and($filters)->not->toContain('drawbox')
        ->and($filters)->not->toContain('geq=')
        ->and($graph['inputs'])->toBe([])
        ->and($graph['output'])->toBe('[stage0]');
});

it('draws a rectangle border with drawbox replace so the alpha channel is written', function () {
    $graph = sceneGraph(scene([shapeLayer([
        'border_color' => '#00ff00',
        'border_width' => 8,
    ])]));

    expect($graph)->toContain(
        'color=c=0xff0000:s=400x200:d=5.000000:r=30,'
        .'drawbox=x=0:y=0:w=iw:h=ih:color=0x00ff00:t=8:replace=1[shape0]'
    );
});

it('uses a transparent colour source for a border-only shape', function () {
    $graph = sceneGraph(scene([shapeLayer([
        'fill_color' => 'transparent',
        'border_color' => '#00ff00',
        'border_width' => 4,
    ])]));

    expect($graph)->toContain(
        'color=c=black@0.0:s=400x200:d=5.000000:r=30,format=rgba,'
        .'drawbox=x=0:y=0:w=iw:h=ih:color=0x00ff00:t=4:replace=1[shape0]'
    );
});

it('skips a shape with neither fill nor border without burning a stage label', function () {
    $graph = sceneGraphArray(scene([
        shapeLayer(['fill_color' => '', 'z_index' => 0]),
        ['type' => 'text', 'text' => 'after', 'z_index' => 1],
    ]));

    expect(implode(';', $graph['filters']))->not->toContain('[shape')
        ->and($graph['output'])->toBe('[stage0]');
});

it('masks an ellipse through a geq alpha expression', function () {
    $graph = sceneGraph(scene([shapeLayer(['shape' => 'ellipse'])]));

    expect($graph)->toContain('color=c=0xff0000:s=400x200:d=5.000000:r=30,format=rgba,geq=')
        ->and($graph)->toContain("a='if((gt(pow(X-W/2,2)/pow(W/2,2)+pow(Y-H/2,2)/pow(H/2,2),1)),0,255)'")
        // geq refuses an alpha-only expression, so the colour planes pass through.
        ->and($graph)->toContain("r='r(X,Y)'");
});

it('paints an ellipse border as a ring between the outer and inset ellipses', function () {
    $graph = sceneGraph(scene([shapeLayer([
        'shape' => 'ellipse',
        'fill_color' => 'transparent',
        'border_color' => '#0000ff',
        'border_width' => 10,
    ])]));

    expect($graph)->toContain('pow(W/2-10,2)')
        // Border pixels take the border colour, the hollow centre stays transparent.
        ->and($graph)->toContain("b='if((gt(pow(X-W/2,2)/pow(W/2-10,2)+pow(Y-H/2,2)/pow(H/2-10,2),1)),255,b(X,Y))'")
        ->and($graph)->toContain(",255,0))'");
});

it('rounds rectangle corners with a signed distance field geq', function () {
    $graph = sceneGraph(scene([shapeLayer(['corner_radius' => 24])]));

    expect($graph)->toContain('format=rgba,geq=')
        ->and($graph)->toContain('hypot(max((abs(X-(W-1)/2)-(W/2-24)),0)')
        ->and($graph)->toContain("a='if((gt((hypot");
});

it('renders a line as a plain bar-shaped colour source', function () {
    $graph = sceneGraph(scene([shapeLayer([
        'shape' => 'line',
        'fill_color' => '#ffffff',
        'width' => 800,
        'height' => 6,
        'corner_radius' => 0,
    ])]));

    expect($graph)->toContain('color=c=0xffffff:s=800x6:d=5.000000:r=30[shape0]')
        ->and($graph)->not->toContain('geq=');
});

it('clamps a shape border to half of its smallest side', function () {
    $graph = sceneGraph(scene([shapeLayer([
        'height' => 20,
        'border_color' => '#000000',
        'border_width' => 500,
    ])]));

    expect($graph)->toContain(':t=10:replace=1');
});

it('applies opacity and rotation to a shape like any other layer', function () {
    $graph = sceneGraph(scene([shapeLayer([
        'width' => 200,
        'height' => 100,
        'opacity' => 0.5,
        'rotation' => 90,
    ])]));

    expect($graph)->toContain('format=rgba,colorchannelmixer=aa=0.500000,rotate=a=1.570796:c=none:ow=100:oh=200')
        // Rotation keeps the layer centred on its original centre point.
        ->and($graph)->toContain('overlay=150:0:shortest=1');
});

it('keeps input indexes intact when a shape sits between two video layers', function () {
    $graph = sceneGraphArray(scene([
        ['type' => 'video', 'asset_id' => 11, 'width' => 100, 'height' => 100, 'z_index' => 0],
        shapeLayer(['z_index' => 1]),
        ['type' => 'video', 'asset_id' => 22, 'width' => 100, 'height' => 100, 'z_index' => 2],
    ]));
    $filters = implode(';', $graph['filters']);

    expect($graph['inputs'])->toBe(['/media/asset-11.mp4', '/media/asset-22.mp4'])
        ->and($filters)->toContain('[0:v]')
        ->and($filters)->toContain('[1:v]')
        // Stage labels stay unique and chained across mixed layer types.
        ->and($filters)->toContain('[base][layer0]overlay=0:0:shortest=1[stage0]')
        ->and($filters)->toContain('[stage0][shape1]overlay=100:50:shortest=1[stage1]')
        ->and($filters)->toContain('[stage1][layer1]overlay=0:0:shortest=1[stage2]')
        ->and($graph['output'])->toBe('[stage2]');
});

it('z-orders media, shape and text layers together', function () {
    $graph = sceneGraph(scene([
        ['type' => 'text', 'text' => 'Top', 'z_index' => 9],
        shapeLayer(['z_index' => 5, 'fill_color' => '#123456']),
        ['type' => 'image', 'asset_id' => 3, 'width' => 10, 'height' => 10, 'z_index' => 1],
    ]));

    expect(strpos($graph, '[layer0]'))->toBeLessThan(strpos($graph, '0x123456'))
        ->and(strpos($graph, '0x123456'))->toBeLessThan(strpos($graph, 'Top'));
});

it('loops overlay image clips for the whole enable window', function () {
    $graph = overlayGraph([[
        'clips' => [[
            'type' => 'image',
            'asset_id' => 4,
            'start_ms' => 500,
            'duration_ms' => 1500,
            'x' => 10,
            'y' => 20,
            'width' => 200,
            'height' => 100,
        ]],
    ]]);

    expect($graph['inputs'])->toBe(['/media/asset-4.mp4'])
        ->and($graph['filters'][0])->toBe(
            '[1:v]scale=200:100,loop=loop=-1:size=1:start=0,setpts=PTS-STARTPTS[scaled1]'
        )
        ->and($graph['filters'][1])->toBe("[0:v][scaled1]overlay=10:20:enable='between(t,0.500000,2.000000)'[out1]")
        ->and($graph['output'])->toBe('[out1]');
});

it('synthesises overlay shape clips without an input file', function () {
    $graph = overlayGraph([[
        'clips' => [[
            'type' => 'shape',
            'shape' => 'rectangle',
            'fill_color' => '#ff0000',
            'start_ms' => 1000,
            'duration_ms' => 2000,
            'x' => 30,
            'y' => 40,
            'width' => 300,
            'height' => 150,
            'opacity' => 0.5,
        ]],
    ]]);

    expect($graph['inputs'])->toBe([])
        ->and($graph['filters'][0])->toBe(
            'color=c=0xff0000:s=300x150:d=3.000000:r=30,format=rgba,colorchannelmixer=aa=0.500000[shape1]'
        )
        ->and($graph['filters'][1])->toBe("[0:v][shape1]overlay=30:40:enable='between(t,1.000000,3.000000)'[out1]")
        ->and($graph['output'])->toBe('[out1]');
});

it('skips overlay shape clips that would paint nothing', function () {
    $graph = overlayGraph([[
        'clips' => [
            ['type' => 'shape', 'fill_color' => 'transparent', 'border_width' => 0, 'width' => 100, 'height' => 100],
            ['type' => 'shape', 'shape' => 'ellipse', 'fill_color' => '#00ff00', 'width' => 100, 'height' => 100],
        ],
    ]]);

    expect($graph['filters'])->toHaveCount(2)
        ->and($graph['filters'][0])->toContain('color=c=0x00ff00:s=100x100')
        ->and($graph['filters'][0])->toContain('geq=')
        ->and($graph['filters'][0])->toEndWith('[shape1]')
        ->and($graph['output'])->toBe('[out1]');
});

it('applies colour adjustments, trim end and rotation to overlay clips like scene layers', function () {
    $graph = overlayGraph([[
        'clips' => [[
            'type' => 'video',
            'asset_id' => 4,
            'start_ms' => 0,
            'duration_ms' => 2000,
            'trim_start_ms' => 1000,
            'trim_end_ms' => 3000,
            'x' => 0,
            'y' => 0,
            'width' => 200,
            'height' => 100,
            'adjustments' => ['brightness' => 0.2, 'contrast' => 1, 'saturation' => 1],
        ]],
    ]]);

    expect($graph['filters'][0])->toBe(
        '[1:v]trim=start=1.000000:end=3.000000,setpts=PTS-STARTPTS,scale=200:100,setpts=PTS-STARTPTS,'
        .'eq=brightness=0.200000:contrast=1.000000:saturation=1.000000[scaled1]'
    )->and($graph['filters'][0])->not->toContain('tpad=');
});

it('lets an overlay text clip drop its background box', function () {
    $graph = overlayGraph([[
        'clips' => [['type' => 'text', 'text' => 'Bare', 'background_color' => 'transparent']],
    ]]);

    expect($graph['filters'][0])->not->toContain('box=1');
});
