<?php

use App\Services\Subtitles\AssSubtitleBuilder;

/**
 * @param  array<string, mixed>  $style
 * @param  array<int, array<string, mixed>>  $entries
 * @return array<string, mixed>
 */
function subtitleTrack(array $style = [], array $entries = [], bool $enabled = true): array
{
    return [
        'id' => 'track-1',
        'name' => 'Subtitles',
        'enabled' => $enabled,
        'style' => array_merge([
            'font_size' => 48,
            'font_color' => '#ffffff',
            'background_color' => '#00000080',
            'position' => 'bottom',
        ], $style),
        'entries' => $entries,
    ];
}

it('emits script info header with play resolution matching the project', function () {
    $ass = (new AssSubtitleBuilder)->build(
        [subtitleTrack(entries: [
            ['start_ms' => 0, 'end_ms' => 2000, 'text' => 'Hello'],
        ])],
        1920,
        1080,
    );

    expect($ass)->toContain('[Script Info]')
        ->and($ass)->toContain('ScriptType: v4.00+')
        ->and($ass)->toContain('PlayResX: 1920')
        ->and($ass)->toContain('PlayResY: 1080')
        ->and($ass)->toContain('[V4+ Styles]')
        ->and($ass)->toContain('[Events]');
});

it('converts hex colours to ass with inverted alpha', function () {
    $builder = new AssSubtitleBuilder;

    // Opaque white: default alpha FF -> ass alpha 00.
    expect($builder->hexToAss('#ffffff'))->toBe('&H00FFFFFF');
    // Semi-transparent black: css alpha 80 (128) -> ass alpha 7F (127).
    expect($builder->hexToAss('#00000080'))->toBe('&H7F000000');
    // Colour channels are reordered to BGR.
    expect($builder->hexToAss('#FACC15'))->toBe('&H0015CCFA');
    // Unknown / named colour falls back to opaque white.
    expect($builder->hexToAss('white'))->toBe('&H00FFFFFF');
});

it('formats timestamps as h:mm:ss.cc centiseconds', function () {
    $builder = new AssSubtitleBuilder;

    expect($builder->formatTime(0))->toBe('0:00:00.00');
    expect($builder->formatTime(3000))->toBe('0:00:03.00');
    expect($builder->formatTime(1500))->toBe('0:00:01.50');
    expect($builder->formatTime(3661230))->toBe('1:01:01.23');
});

it('writes a style line with karaoke primary/secondary colour mapping', function () {
    $ass = (new AssSubtitleBuilder)->build(
        [subtitleTrack(
            style: [
                'font_color' => '#ffffff',
                'highlight_color' => '#FACC15',
                'stroke_color' => '#000000',
                'stroke_width' => 6,
                'background_color' => 'transparent',
            ],
            entries: [[
                'start_ms' => 0,
                'end_ms' => 1000,
                'text' => 'hi there',
                'words' => [
                    ['text' => 'hi', 'start_ms' => 0, 'end_ms' => 500],
                    ['text' => 'there', 'start_ms' => 500, 'end_ms' => 1000],
                ],
            ]],
        )],
        1920,
        1080,
    );

    $styleLine = collect(explode("\n", $ass))->first(fn ($l) => str_starts_with($l, 'Style: '));

    // PrimaryColour = highlight, SecondaryColour = base font colour.
    expect($styleLine)->toContain('&H0015CCFA') // highlight (primary)
        ->and($styleLine)->toContain('&H00FFFFFF'); // base (secondary)

    // Transparent background -> BorderStyle 1 (outline), Outline width 6.
    $parts = explode(',', $styleLine);
    // Fields: Name,Fontname,Fontsize,Primary,Secondary,Outline,Back,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,...
    expect(trim($parts[15]))->toBe('1'); // BorderStyle
    expect(trim($parts[16]))->toBe('6'); // Outline width
    expect(trim($parts[18]))->toBe('2'); // Alignment (bottom)
});

it('uses border style 3 and a back colour when a background box is set', function () {
    $ass = (new AssSubtitleBuilder)->build(
        [subtitleTrack(
            style: ['background_color' => '#111827ff', 'position' => 'top'],
            entries: [['start_ms' => 0, 'end_ms' => 1000, 'text' => 'Boxed']],
        )],
        1920,
        1080,
    );

    $styleLine = collect(explode("\n", $ass))->first(fn ($l) => str_starts_with($l, 'Style: '));
    $parts = explode(',', $styleLine);

    expect(trim($parts[15]))->toBe('3'); // BorderStyle box
    expect(trim($parts[6]))->toBe('&H00271811'); // BackColour (bgr of 111827, opaque)
    expect(trim($parts[18]))->toBe('8'); // Alignment top
});

it('preserves dialogue ordering', function () {
    $ass = (new AssSubtitleBuilder)->build(
        [subtitleTrack(entries: [
            ['start_ms' => 0, 'end_ms' => 1000, 'text' => 'First'],
            ['start_ms' => 1000, 'end_ms' => 2000, 'text' => 'Second'],
            ['start_ms' => 2000, 'end_ms' => 3000, 'text' => 'Third'],
        ])],
        1920,
        1080,
    );

    $dialogue = collect(explode("\n", $ass))
        ->filter(fn ($l) => str_starts_with($l, 'Dialogue: '))
        ->values();

    expect($dialogue)->toHaveCount(3);
    expect($dialogue[0])->toContain('First');
    expect($dialogue[1])->toContain('Second');
    expect($dialogue[2])->toContain('Third');
    // First then Second then Third by timestamp.
    expect($dialogue[0])->toContain('0:00:00.00,0:00:01.00');
    expect($dialogue[1])->toContain('0:00:01.00,0:00:02.00');
});

it('applies uppercase text transform to dialogue text', function () {
    $ass = (new AssSubtitleBuilder)->build(
        [subtitleTrack(
            style: ['text_transform' => 'uppercase'],
            entries: [['start_ms' => 0, 'end_ms' => 1000, 'text' => 'Hello world']],
        )],
        1920,
        1080,
    );

    expect($ass)->toContain('HELLO WORLD')
        ->and($ass)->not->toContain('Hello world');
});

it('emits karaoke k tags whose durations sum to the entry duration in centiseconds', function () {
    $ass = (new AssSubtitleBuilder)->build(
        [subtitleTrack(
            style: ['highlight_color' => '#FACC15'],
            entries: [[
                'start_ms' => 0,
                'end_ms' => 2000,
                'text' => 'one two three',
                'words' => [
                    ['text' => 'one', 'start_ms' => 0, 'end_ms' => 500],
                    ['text' => 'two', 'start_ms' => 500, 'end_ms' => 1200],
                    ['text' => 'three', 'start_ms' => 1300, 'end_ms' => 2000],
                ],
            ]],
        )],
        1920,
        1080,
    );

    $dialogue = collect(explode("\n", $ass))->first(fn ($l) => str_starts_with($l, 'Dialogue: '));

    preg_match_all('/\{\\\\k(\d+)\}/', $dialogue, $matches);
    $durations = array_map('intval', $matches[1]);

    expect($durations)->toHaveCount(3);
    // Cumulative rounded boundaries: 50, 80, 70.
    expect($durations)->toBe([50, 80, 70]);
    // Sum equals entry duration (2000ms = 200cs).
    expect(array_sum($durations))->toBe(200);
});

it('uppercases karaoke word text', function () {
    $ass = (new AssSubtitleBuilder)->build(
        [subtitleTrack(
            style: ['highlight_color' => '#FACC15', 'text_transform' => 'uppercase'],
            entries: [[
                'start_ms' => 0,
                'end_ms' => 1000,
                'text' => 'go now',
                'words' => [
                    ['text' => 'go', 'start_ms' => 0, 'end_ms' => 500],
                    ['text' => 'now', 'start_ms' => 500, 'end_ms' => 1000],
                ],
            ]],
        )],
        1920,
        1080,
    );

    expect($ass)->toContain('}GO ')
        ->and($ass)->toContain('}NOW');
});

it('escapes ass special characters', function () {
    $builder = new AssSubtitleBuilder;

    expect($builder->escapeText('Hi {there}'))->toBe('Hi \\{there\\}');
    expect($builder->escapeText("line1\nline2"))->toBe('line1\\Nline2');
    expect($builder->escapeText("a\r\nb"))->toBe('a\\Nb');
});

it('skips disabled tracks', function () {
    $ass = (new AssSubtitleBuilder)->build(
        [
            subtitleTrack(
                entries: [['start_ms' => 0, 'end_ms' => 1000, 'text' => 'Visible']],
            ),
            subtitleTrack(
                entries: [['start_ms' => 0, 'end_ms' => 1000, 'text' => 'Hidden']],
                enabled: false,
            ),
        ],
        1920,
        1080,
    );

    expect($ass)->toContain('Visible')
        ->and($ass)->not->toContain('Hidden');
});

it('skips entries with no text or non-positive duration', function () {
    $ass = (new AssSubtitleBuilder)->build(
        [subtitleTrack(entries: [
            ['start_ms' => 0, 'end_ms' => 0, 'text' => 'ZeroDuration'],
            ['start_ms' => 0, 'end_ms' => 1000, 'text' => '   '],
            ['start_ms' => 0, 'end_ms' => 1000, 'text' => 'Keep'],
        ])],
        1920,
        1080,
    );

    $dialogue = collect(explode("\n", $ass))->filter(fn ($l) => str_starts_with($l, 'Dialogue: '));

    expect($dialogue)->toHaveCount(1);
    expect($ass)->toContain('Keep')
        ->and($ass)->not->toContain('ZeroDuration');
});
