<?php

use App\Services\FFmpegService;

/**
 * @param  array<string, mixed>  $transition
 * @return array<string, mixed>
 */
function transitionScene(int $durationMs = 5000, ?array $transition = null, array $layers = []): array
{
    $scene = [
        'id' => 'scene-'.$durationMs,
        'duration_ms' => $durationMs,
        'layers' => $layers,
    ];

    if ($transition !== null) {
        $scene['transition'] = $transition;
    }

    return $scene;
}

/**
 * @return callable(mixed): (array{path: string, duration_ms: int|null}|null)
 */
function transitionAssetResolver(): callable
{
    return fn (mixed $id): ?array => $id === 0
        ? null
        : ['path' => "/media/asset-{$id}.mp4", 'duration_ms' => 10000];
}

/*
|--------------------------------------------------------------------------
| resolveTransitions
|--------------------------------------------------------------------------
*/

it('resolves no transitions when no scene declares one', function () {
    $transitions = (new FFmpegService)->resolveTransitions([
        transitionScene(4000),
        transitionScene(6000),
    ], 30);

    expect($transitions)->toBe([]);
});

it('resolves no transitions for a single scene', function () {
    $transitions = (new FFmpegService)->resolveTransitions([
        transitionScene(4000, ['type' => 'fade', 'duration_ms' => 500]),
    ], 30);

    expect($transitions)->toBe([]);
});

it('ignores a transition declared on the last scene', function () {
    $transitions = (new FFmpegService)->resolveTransitions([
        transitionScene(4000),
        transitionScene(6000, ['type' => 'wipeleft', 'duration_ms' => 800]),
    ], 30);

    expect($transitions)->toBe([]);
});

it('gives undeclared junctions a one frame fade once any transition exists', function () {
    $transitions = (new FFmpegService)->resolveTransitions([
        transitionScene(4000),
        transitionScene(4000, ['type' => 'slideleft', 'duration_ms' => 600]),
        transitionScene(4000),
    ], 25);

    expect($transitions[0])->toBe(['type' => 'fade', 'duration_ms' => 40, 'declared' => false])
        ->and($transitions[1])->toBe(['type' => 'slideleft', 'duration_ms' => 600, 'declared' => true]);
});

it('falls back to fade for an unknown transition type', function () {
    $transitions = (new FFmpegService)->resolveTransitions([
        transitionScene(4000, ['type' => 'explode', 'duration_ms' => 400]),
        transitionScene(4000),
    ], 30);

    expect($transitions[0]['type'])->toBe('fade');
});

it('defaults the transition duration to 500ms', function () {
    $transitions = (new FFmpegService)->resolveTransitions([
        transitionScene(4000, ['type' => 'dissolve']),
        transitionScene(4000),
    ], 30);

    expect($transitions[0]['duration_ms'])->toBe(500);
});

it('clamps the transition duration to 1500ms', function () {
    $transitions = (new FFmpegService)->resolveTransitions([
        transitionScene(10000, ['type' => 'fade', 'duration_ms' => 5000]),
        transitionScene(10000),
    ], 30);

    expect($transitions[0]['duration_ms'])->toBe(1500);
});

it('clamps the transition duration to half of the shortest adjacent scene', function () {
    $transitions = (new FFmpegService)->resolveTransitions([
        transitionScene(10000, ['type' => 'fade', 'duration_ms' => 1200]),
        transitionScene(1000),
    ], 30);

    expect($transitions[0]['duration_ms'])->toBe(500);

    $transitions = (new FFmpegService)->resolveTransitions([
        transitionScene(800, ['type' => 'fade', 'duration_ms' => 1200]),
        transitionScene(10000),
    ], 30);

    expect($transitions[0]['duration_ms'])->toBe(400);
});

/*
|--------------------------------------------------------------------------
| buildTransitionFilterGraph
|--------------------------------------------------------------------------
*/

it('returns a passthrough graph when there are no transitions', function () {
    $graph = (new FFmpegService)->buildTransitionFilterGraph([
        transitionScene(4000),
        transitionScene(6000),
    ], 30);

    expect($graph['filters'])->toBe([])
        ->and($graph['output'])->toBe('[0:v]')
        ->and($graph['totalDurationMs'])->toBe(10000);
});

it('builds an xfade junction for two scenes', function () {
    $graph = (new FFmpegService)->buildTransitionFilterGraph([
        transitionScene(4000, ['type' => 'fadeblack', 'duration_ms' => 500]),
        transitionScene(6000),
    ], 30);

    expect($graph['filters'])->toBe([
        '[0:v]settb=AVTB,setpts=PTS-STARTPTS,format=yuv420p[xv0]',
        '[1:v]settb=AVTB,setpts=PTS-STARTPTS,format=yuv420p[xv1]',
        '[xv0][xv1]xfade=transition=fadeblack:duration=0.500:offset=3.500[xf1]',
    ])
        ->and($graph['output'])->toBe('[xf1]')
        ->and($graph['totalDurationMs'])->toBe(9500);
});

it('chains xfade offsets and shortens the output for three scenes', function () {
    // Junction 0 offset: 4000 - 500 = 3500ms
    // Junction 1 offset: (4000 + 4000 - 500) - 1000 = 6500ms
    $graph = (new FFmpegService)->buildTransitionFilterGraph([
        transitionScene(4000, ['type' => 'fade', 'duration_ms' => 500]),
        transitionScene(4000, ['type' => 'slideleft', 'duration_ms' => 1000]),
        transitionScene(4000),
    ], 30);

    expect($graph['filters'])->toBe([
        '[0:v]settb=AVTB,setpts=PTS-STARTPTS,format=yuv420p[xv0]',
        '[1:v]settb=AVTB,setpts=PTS-STARTPTS,format=yuv420p[xv1]',
        '[2:v]settb=AVTB,setpts=PTS-STARTPTS,format=yuv420p[xv2]',
        '[xv0][xv1]xfade=transition=fade:duration=0.500:offset=3.500[xf1]',
        '[xf1][xv2]xfade=transition=slideleft:duration=1.000:offset=6.500[xf2]',
    ])
        ->and($graph['output'])->toBe('[xf2]')
        ->and($graph['totalDurationMs'])->toBe(10500);
});

it('chains hard-cut junctions through xfade when only some scenes have transitions', function () {
    $graph = (new FFmpegService)->buildTransitionFilterGraph([
        transitionScene(4000),
        transitionScene(4000, ['type' => 'circleopen', 'duration_ms' => 500]),
        transitionScene(4000),
    ], 25);

    // Junction 0 is a one-frame (40ms) fade, junction 1 the declared 500ms one.
    expect($graph['filters'][3])->toBe('[xv0][xv1]xfade=transition=fade:duration=0.040:offset=3.960[xf1]')
        ->and($graph['filters'][4])->toBe('[xf1][xv2]xfade=transition=circleopen:duration=0.500:offset=7.460[xf2]')
        ->and($graph['totalDurationMs'])->toBe(11460);
});

it('reports the total output duration minus every transition', function () {
    $ffmpeg = new FFmpegService;

    $scenes = [
        transitionScene(4000, ['type' => 'fade', 'duration_ms' => 500]),
        transitionScene(4000, ['type' => 'fade', 'duration_ms' => 800]),
        transitionScene(4000),
    ];

    expect($ffmpeg->totalOutputDurationMs($scenes, 30))->toBe(10700)
        ->and($ffmpeg->totalOutputDurationMs([transitionScene(4000), transitionScene(4000)], 30))->toBe(8000);
});

/*
|--------------------------------------------------------------------------
| Timeline mapping
|--------------------------------------------------------------------------
*/

it('maps timeline positions unchanged when there are no transitions', function () {
    $scenes = [transitionScene(4000), transitionScene(4000)];

    expect((new FFmpegService)->mapTimelineMs($scenes, 6000, 30))->toBe(6000);
});

it('shifts timeline positions by the transitions accumulated before their scene', function () {
    $ffmpeg = new FFmpegService;

    $scenes = [
        transitionScene(4000, ['type' => 'fade', 'duration_ms' => 500]),
        transitionScene(4000, ['type' => 'fade', 'duration_ms' => 1000]),
        transitionScene(4000),
    ];

    expect($ffmpeg->mapTimelineMs($scenes, 0, 30))->toBe(0)
        ->and($ffmpeg->mapTimelineMs($scenes, 3999, 30))->toBe(3999)
        // Inside scene 2: shifted by 500ms
        ->and($ffmpeg->mapTimelineMs($scenes, 4000, 30))->toBe(3500)
        // Inside scene 3: shifted by 500 + 1000ms
        ->and($ffmpeg->mapTimelineMs($scenes, 8000, 30))->toBe(6500)
        // Past the end clamps to the output duration
        ->and($ffmpeg->mapTimelineMs($scenes, 12000, 30))->toBe(10500);
});

it('reports the output start time of every scene', function () {
    $scenes = [
        transitionScene(4000, ['type' => 'fade', 'duration_ms' => 500]),
        transitionScene(4000, ['type' => 'fade', 'duration_ms' => 1000]),
        transitionScene(4000),
    ];

    expect((new FFmpegService)->sceneOutputStartTimes($scenes, 30))->toBe([0, 3500, 6500]);
});

it('shifts subtitle entries and words onto the output timeline', function () {
    $scenes = [
        transitionScene(4000, ['type' => 'fade', 'duration_ms' => 500]),
        transitionScene(4000),
    ];

    $shifted = (new FFmpegService)->shiftSubtitleTracks([[
        'entries' => [[
            'start_ms' => 4200,
            'end_ms' => 6000,
            'words' => [['text' => 'hi', 'start_ms' => 4200, 'end_ms' => 4500]],
        ]],
    ]], $scenes, 30);

    expect($shifted[0]['entries'][0]['start_ms'])->toBe(3700)
        ->and($shifted[0]['entries'][0]['end_ms'])->toBe(5500)
        ->and($shifted[0]['entries'][0]['words'][0]['start_ms'])->toBe(3700)
        ->and($shifted[0]['entries'][0]['words'][0]['end_ms'])->toBe(4000);
});

it('leaves subtitle tracks untouched when there are no transitions', function () {
    $tracks = [['entries' => [['start_ms' => 4200, 'end_ms' => 6000]]]];

    expect((new FFmpegService)->shiftSubtitleTracks($tracks, [transitionScene(4000), transitionScene(4000)], 30))
        ->toBe($tracks);
});

/*
|--------------------------------------------------------------------------
| Downstream graphs
|--------------------------------------------------------------------------
*/

it('shifts audio clip delays by the accumulated transition durations', function () {
    $scenes = [
        transitionScene(4000, ['type' => 'fade', 'duration_ms' => 500]),
        transitionScene(4000),
    ];

    $graph = (new FFmpegService)->buildAudioMixFilter([[
        'clips' => [['asset_id' => 3, 'start_ms' => 5000, 'duration_ms' => 1000]],
    ]], transitionAssetResolver(), $scenes, 30);

    expect($graph['filters'][0])->toContain('adelay=4500|4500');
});

it('shifts overlay clip enable windows by the accumulated transition durations', function () {
    $scenes = [
        transitionScene(4000, ['type' => 'fade', 'duration_ms' => 500]),
        transitionScene(4000),
    ];

    $graph = (new FFmpegService)->buildOverlayFilterGraph([[
        'clips' => [[
            'type' => 'text',
            'text' => 'Hello',
            'start_ms' => 5000,
            'duration_ms' => 1000,
        ]],
    ]], transitionAssetResolver(), fn () => null, $scenes, 30);

    expect($graph['filters'][0])->toContain("enable='between(t,4.500000,5.500000)'");
});

it('crossfades and shifts scene audio around a transition', function () {
    $scenes = [
        transitionScene(4000, ['type' => 'fade', 'duration_ms' => 500], [
            ['type' => 'video', 'asset_id' => 1],
        ]),
        transitionScene(4000, null, [
            ['type' => 'video', 'asset_id' => 2],
        ]),
    ];

    $graph = (new FFmpegService)->buildSceneAudioFilter($scenes, 30, transitionAssetResolver());

    expect($graph['inputs'])->toBe(['/media/asset-1.mp4', '/media/asset-2.mp4'])
        ->and($graph['filters'][0])->toBe(
            '[0:a]atrim=0:4.000000,asetpts=PTS-STARTPTS,afade=t=out:st=3.500000:d=0.500000,adelay=0|0[a0]'
        )
        ->and($graph['filters'][1])->toBe(
            '[1:a]atrim=0:4.000000,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.500000,adelay=3500|3500[a1]'
        )
        ->and($graph['filters'][2])->toBe('[a0][a1]amix=inputs=2:duration=longest[aout]');
});

it('places scene audio at plain scene offsets without transitions', function () {
    $scenes = [
        transitionScene(4000, null, [['type' => 'video', 'asset_id' => 1]]),
        transitionScene(4000, null, [['type' => 'video', 'asset_id' => 2]]),
    ];

    $graph = (new FFmpegService)->buildSceneAudioFilter($scenes, 30, transitionAssetResolver());

    expect($graph['filters'][0])->toBe('[0:a]atrim=0:4.000000,asetpts=PTS-STARTPTS,adelay=0|0[a0]')
        ->and($graph['filters'][1])->toBe('[1:a]atrim=0:4.000000,asetpts=PTS-STARTPTS,adelay=4000|4000[a1]');
});

it('returns a null scene audio output when no scene has a video layer', function () {
    $graph = (new FFmpegService)->buildSceneAudioFilter([
        transitionScene(4000, null, [['type' => 'image', 'asset_id' => 1]]),
    ], 30, transitionAssetResolver());

    expect($graph['output'])->toBeNull()
        ->and($graph['filters'])->toBe([]);
});
