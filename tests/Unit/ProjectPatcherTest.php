<?php

use App\Ai\Composition\ProjectPatcher;
use Illuminate\Support\Str;

function patcherProject(): array
{
    return [
        'name' => 'Base',
        'resolution_width' => 1080,
        'resolution_height' => 1920,
        'fps' => 30,
        'brand_kit_id' => null,
        'scenes' => [[
            'id' => '11111111-1111-4111-8111-111111111111',
            'name' => 'Hook',
            'duration_ms' => 3000,
            'layers' => [[
                'id' => '22222222-2222-4222-8222-222222222222',
                'type' => 'text',
                'text' => 'Hello',
                'x' => 0, 'y' => 0, 'width' => 500, 'height' => 100, 'z_index' => 1,
            ]],
        ]],
        'video_tracks' => [[
            'id' => '33333333-3333-4333-8333-333333333333',
            'name' => 'Overlays',
            'clips' => [[
                'id' => '44444444-4444-4444-8444-444444444444',
                'type' => 'shape',
                'shape' => 'rectangle',
                'start_ms' => 0, 'end_ms' => 1000,
            ]],
        ]],
        'audio_tracks' => [],
        'subtitle_tracks' => [],
    ];
}

it('sets project fields', function () {
    $result = ProjectPatcher::apply(patcherProject(), [
        ['op' => 'set_project', 'fps' => 24, 'brand_kit_id' => 7, 'name' => 'Renamed', 'ignored' => 'x'],
    ]);

    expect($result['applied'])->toBe(['set_project'])
        ->and($result['project']['fps'])->toBe(24)
        ->and($result['project']['brand_kit_id'])->toBe(7)
        ->and($result['project']['name'])->toBe('Renamed')
        ->and($result['project'])->not->toHaveKey('ignored');
});

it('sets scene fields by id or name', function () {
    $result = ProjectPatcher::apply(patcherProject(), [
        ['op' => 'set_scene', 'scene_id' => 'Hook', 'duration_ms' => 4500, 'transition' => ['type' => 'fade', 'duration_ms' => 300]],
    ]);

    expect($result['project']['scenes'][0]['duration_ms'])->toBe(4500)
        ->and($result['project']['scenes'][0]['transition']['type'])->toBe('fade');
});

it('adds a scene at an index with uuid ids and removes it again', function () {
    $result = ProjectPatcher::apply(patcherProject(), [
        ['op' => 'add_scene', 'index' => 0, 'scene' => ['id' => 'intro', 'duration_ms' => 1500, 'layers' => [['id' => 'l', 'type' => 'text', 'text' => 'Intro']]]],
    ]);

    $scenes = $result['project']['scenes'];

    expect($scenes)->toHaveCount(2)
        ->and(Str::isUuid($scenes[0]['id']))->toBeTrue()
        ->and(Str::isUuid($scenes[0]['layers'][0]['id']))->toBeTrue()
        ->and($scenes[0]['layers'][0]['text'])->toBe('Intro');

    $removed = ProjectPatcher::apply($result['project'], [['op' => 'remove_scene', 'scene_id' => $scenes[0]['id']]]);

    expect($removed['project']['scenes'])->toHaveCount(1)
        ->and($removed['project']['scenes'][0]['name'])->toBe('Hook');
});

it('adds, updates and removes elements in scenes and video tracks', function () {
    $project = patcherProject();

    $result = ProjectPatcher::apply($project, [
        ['op' => 'add_element', 'scene_id' => $project['scenes'][0]['id'], 'element' => ['type' => 'shape', 'shape' => 'ellipse']],
        ['op' => 'add_element', 'track_id' => $project['video_tracks'][0]['id'], 'element' => ['type' => 'text', 'text' => 'Overlay', 'start_ms' => 0, 'end_ms' => 500]],
        ['op' => 'update_element', 'element_id' => '22222222-2222-4222-8222-222222222222', 'fields' => ['text' => 'Changed', 'id' => 'must-not-change']],
        ['op' => 'update_element', 'element_id' => '44444444-4444-4444-8444-444444444444', 'fields' => ['fill_color' => 'brand.primary']],
        ['op' => 'remove_element', 'element_id' => '44444444-4444-4444-8444-444444444444'],
    ]);

    $scene = $result['project']['scenes'][0];
    $track = $result['project']['video_tracks'][0];

    expect($result['applied'])->toHaveCount(5)
        ->and($scene['layers'])->toHaveCount(2)
        ->and($scene['layers'][0]['text'])->toBe('Changed')
        ->and($scene['layers'][0]['id'])->toBe('22222222-2222-4222-8222-222222222222')
        ->and(Str::isUuid($scene['layers'][1]['id']))->toBeTrue()
        ->and($track['clips'])->toHaveCount(1)
        ->and($track['clips'][0]['text'])->toBe('Overlay');
});

it('creates a subtitle track on demand for style and entries', function () {
    $result = ProjectPatcher::apply(patcherProject(), [
        ['op' => 'set_subtitle_style', 'style' => ['font_size' => 64, 'highlight_color' => 'brand.caption_highlight']],
        ['op' => 'add_subtitle_entries', 'entries' => [
            ['start_ms' => 1000, 'end_ms' => 2000, 'text' => 'second'],
            ['start_ms' => 0, 'end_ms' => 900, 'text' => 'first'],
        ]],
    ]);

    $track = $result['project']['subtitle_tracks'][0];

    expect($result['project']['subtitle_tracks'])->toHaveCount(1)
        ->and($track['enabled'])->toBeTrue()
        ->and($track['style']['font_size'])->toBe(64)
        ->and($track['entries'][0]['text'])->toBe('first')
        ->and(Str::isUuid($track['entries'][0]['id']))->toBeTrue();
});

it('adds audio clips to a named track, creating it when missing', function () {
    $result = ProjectPatcher::apply(patcherProject(), [
        ['op' => 'add_audio_clip', 'track_name' => 'Voice', 'clip' => ['asset_id' => 9, 'start_ms' => 0, 'end_ms' => 3000]],
        ['op' => 'add_audio_clip', 'track_name' => 'Voice', 'clip' => ['asset_id' => 10, 'start_ms' => 3000, 'duration_ms' => 2000]],
    ]);

    $track = $result['project']['audio_tracks'][0];

    expect($result['project']['audio_tracks'])->toHaveCount(1)
        ->and($track['name'])->toBe('Voice')
        ->and($track['clips'])->toHaveCount(2)
        ->and($track['clips'][0]['duration_ms'])->toBe(3000)
        ->and($track['clips'][0]['volume'])->toBe(1.0);
});

it('rejects unknown operations with the valid list', function () {
    ProjectPatcher::apply(patcherProject(), [['op' => 'explode']]);
})->throws(InvalidArgumentException::class, 'Unknown op "explode"');

it('rejects references to missing scenes, elements and tracks', function (array $operation, string $message) {
    ProjectPatcher::apply(patcherProject(), [$operation]);
})->with([
    'scene' => [['op' => 'set_scene', 'scene_id' => 'nope', 'duration_ms' => 1], 'Scene "nope" was not found'],
    'element' => [['op' => 'remove_element', 'element_id' => 'nope'], 'Element "nope" was not found'],
    'track' => [['op' => 'add_element', 'track_id' => 'nope', 'element' => ['type' => 'text']], 'Video track "nope" was not found'],
    'audio' => [['op' => 'add_audio_clip', 'track_id' => 'nope', 'clip' => ['asset_id' => 1]], 'Audio track "nope" was not found'],
])->throws(InvalidArgumentException::class);
