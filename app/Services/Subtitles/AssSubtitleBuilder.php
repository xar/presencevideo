<?php

namespace App\Services\Subtitles;

/**
 * Builds Advanced SubStation Alpha (.ass) subtitle files from the project's
 * subtitle track JSON. PlayResX/PlayResY are set to the project resolution so
 * that style `font_size` values map 1:1 to pixels, matching the WYSIWYG
 * preview.
 *
 * Karaoke: when an entry has per-word timings and the style defines a
 * `highlight_color`, `\k` tags are emitted so words fill from the base
 * `font_color` (SecondaryColour) to the `highlight_color` (PrimaryColour) as
 * playback reaches each word.
 */
class AssSubtitleBuilder
{
    protected const DEFAULT_FONT = 'Arial';

    /**
     * Build a complete .ass document for the given subtitle tracks.
     *
     * @param  array<int, array{
     *     id?: string,
     *     name?: string,
     *     enabled?: bool,
     *     style?: array<string, mixed>,
     *     entries?: array<int, array{start_ms?: int, end_ms?: int, text?: string, words?: array<int, array{text?: string, start_ms?: int, end_ms?: int}>}>
     * }>  $tracks
     */
    public function build(array $tracks, int $width, int $height): string
    {
        $styleLines = [];
        $dialogueLines = [];

        $marginV = max(10, (int) round(20 * $height / 1080));

        foreach ($tracks as $index => $track) {
            if (($track['enabled'] ?? true) === false) {
                continue;
            }

            $entries = $this->renderableEntries($track['entries'] ?? []);
            if ($entries === []) {
                continue;
            }

            $style = $track['style'] ?? [];
            $styleName = 'Track'.$index;

            $styleLines[] = $this->buildStyleLine($styleName, $style, $marginV);

            foreach ($entries as $entry) {
                $dialogueLines[] = $this->buildDialogueLine($styleName, $style, $entry);
            }
        }

        return $this->assembleDocument($width, $height, $styleLines, $dialogueLines);
    }

    /**
     * Filter out entries with no text and no positive duration.
     *
     * @param  array<int, array<string, mixed>>  $entries
     * @return array<int, array<string, mixed>>
     */
    protected function renderableEntries(array $entries): array
    {
        return array_values(array_filter($entries, function ($entry): bool {
            $text = trim((string) ($entry['text'] ?? ''));
            $end = (int) ($entry['end_ms'] ?? 0);
            $start = (int) ($entry['start_ms'] ?? 0);

            return $text !== '' && $end > $start;
        }));
    }

    /**
     * @param  array<string, mixed>  $style
     */
    protected function buildStyleLine(string $name, array $style, int $marginV): string
    {
        $fontName = $this->fontName($style['font_family'] ?? null);
        $fontSize = (int) ($style['font_size'] ?? 48);

        $fontColor = (string) ($style['font_color'] ?? '#ffffff');
        $highlightColor = $style['highlight_color'] ?? null;
        $strokeColor = (string) ($style['stroke_color'] ?? '#000000');
        $strokeWidth = (float) ($style['stroke_width'] ?? 0);
        $backgroundColor = $style['background_color'] ?? null;

        $hasBox = $this->hasBackground($backgroundColor);
        $isKaraoke = $highlightColor !== null && $highlightColor !== '';

        // For karaoke, PrimaryColour is the highlight (fill) and SecondaryColour
        // is the base colour words start in. Otherwise both are the base colour.
        $primaryColour = $isKaraoke
            ? $this->hexToAss((string) $highlightColor)
            : $this->hexToAss($fontColor);
        $secondaryColour = $this->hexToAss($fontColor);
        $outlineColour = $this->hexToAss($strokeColor);
        $backColour = $hasBox ? $this->hexToAss((string) $backgroundColor) : '&H00000000';

        $borderStyle = $hasBox ? 3 : 1;
        $shadow = 0;

        $alignment = ($style['position'] ?? 'bottom') === 'top' ? 8 : 2;

        return sprintf(
            'Style: %s,%s,%d,%s,%s,%s,%s,-1,0,0,0,100,100,0,0,%d,%s,%d,%d,20,20,%d,1',
            $name,
            $fontName,
            $fontSize,
            $primaryColour,
            $secondaryColour,
            $outlineColour,
            $backColour,
            $borderStyle,
            $this->formatOutline($strokeWidth),
            $shadow,
            $alignment,
            $marginV,
        );
    }

    /**
     * @param  array<string, mixed>  $style
     * @param  array<string, mixed>  $entry
     */
    protected function buildDialogueLine(string $styleName, array $style, array $entry): string
    {
        $start = (int) ($entry['start_ms'] ?? 0);
        $end = (int) ($entry['end_ms'] ?? 0);
        $uppercase = ($style['text_transform'] ?? 'none') === 'uppercase';

        $highlightColor = $style['highlight_color'] ?? null;
        $isKaraoke = $highlightColor !== null && $highlightColor !== ''
            && ! empty($entry['words']);

        if ($isKaraoke) {
            /** @var array<int, array{text?: string, start_ms?: int, end_ms?: int}> $words */
            $words = $entry['words'];
            $text = $this->buildKaraokeText($words, $start, $end, $uppercase);
        } else {
            $rawText = (string) ($entry['text'] ?? '');
            if ($uppercase) {
                $rawText = mb_strtoupper($rawText);
            }
            $text = $this->escapeText($rawText);
        }

        return sprintf(
            'Dialogue: 0,%s,%s,%s,,0,0,0,,%s',
            $this->formatTime($start),
            $this->formatTime($end),
            $styleName,
            $text,
        );
    }

    /**
     * Build karaoke text with `\k` tags. Each tag's duration (centiseconds) is
     * derived from cumulative rounded boundaries so the durations sum exactly to
     * the entry's duration in centiseconds.
     *
     * @param  array<int, array{text?: string, start_ms?: int, end_ms?: int}>  $words
     */
    protected function buildKaraokeText(array $words, int $entryStart, int $entryEnd, bool $uppercase): string
    {
        $words = array_values($words);
        $count = count($words);
        $parts = [];
        $prevCs = 0;

        foreach ($words as $i => $word) {
            $nextMs = $i + 1 < $count
                ? ((int) ($words[$i + 1]['start_ms'] ?? $entryEnd)) - $entryStart
                : $entryEnd - $entryStart;

            $nextCs = (int) round($nextMs / 10);
            $k = $nextCs - $prevCs;
            if ($k < 0) {
                $k = 0;
            }
            $prevCs = $nextCs;

            $wordText = (string) ($word['text'] ?? '');
            if ($uppercase) {
                $wordText = mb_strtoupper($wordText);
            }

            $parts[] = '{\\k'.$k.'}'.$this->escapeText($wordText).($i < $count - 1 ? ' ' : '');
        }

        return implode('', $parts);
    }

    /**
     * @param  array<int, string>  $styleLines
     * @param  array<int, string>  $dialogueLines
     */
    protected function assembleDocument(int $width, int $height, array $styleLines, array $dialogueLines): string
    {
        $lines = [];

        $lines[] = '[Script Info]';
        $lines[] = 'ScriptType: v4.00+';
        $lines[] = 'WrapStyle: 0';
        $lines[] = 'ScaledBorderAndShadow: yes';
        $lines[] = 'PlayResX: '.$width;
        $lines[] = 'PlayResY: '.$height;
        $lines[] = '';

        $lines[] = '[V4+ Styles]';
        $lines[] = 'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding';
        foreach ($styleLines as $styleLine) {
            $lines[] = $styleLine;
        }
        $lines[] = '';

        $lines[] = '[Events]';
        $lines[] = 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text';
        foreach ($dialogueLines as $dialogueLine) {
            $lines[] = $dialogueLine;
        }

        return implode("\n", $lines)."\n";
    }

    /**
     * Convert a CSS hex colour (`#RRGGBB` or `#RRGGBBAA`) to ASS `&HAABBGGRR`.
     *
     * ASS alpha is inverted relative to CSS: `00` is opaque and `FF` is fully
     * transparent, so the CSS alpha is subtracted from 255.
     */
    public function hexToAss(string $color): string
    {
        $hex = ltrim(trim($color), '#');

        if (! preg_match('/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/', $hex)) {
            // Unknown/named colour: fall back to opaque white.
            return '&H00FFFFFF';
        }

        $r = (int) hexdec(substr($hex, 0, 2));
        $g = (int) hexdec(substr($hex, 2, 2));
        $b = (int) hexdec(substr($hex, 4, 2));
        $cssAlpha = strlen($hex) === 8 ? (int) hexdec(substr($hex, 6, 2)) : 255;
        $assAlpha = 255 - $cssAlpha;

        return sprintf('&H%02X%02X%02X%02X', $assAlpha, $b, $g, $r);
    }

    protected function hasBackground(mixed $color): bool
    {
        if (! is_string($color)) {
            return false;
        }

        $normalized = strtolower(trim($color));
        if ($normalized === '' || $normalized === 'transparent') {
            return false;
        }

        // Fully transparent hex (#RRGGBB00).
        if (preg_match('/^#[0-9a-f]{8}$/', $normalized) === 1 && substr($normalized, 7) === '00') {
            return false;
        }

        return true;
    }

    protected function fontName(mixed $fontFamily): string
    {
        if (! is_string($fontFamily) || trim($fontFamily) === '') {
            return self::DEFAULT_FONT;
        }

        // Take the first family from a CSS font stack and strip quotes.
        $first = trim(explode(',', $fontFamily)[0]);
        $first = trim($first, "\"'");

        return $first === '' ? self::DEFAULT_FONT : $first;
    }

    protected function formatOutline(float $outline): string
    {
        if ($outline === floor($outline)) {
            return (string) (int) $outline;
        }

        return rtrim(rtrim(sprintf('%.2f', $outline), '0'), '.');
    }

    /**
     * Format milliseconds as an ASS timestamp `h:mm:ss.cc` (centiseconds).
     */
    public function formatTime(int $ms): string
    {
        $totalCs = (int) round($ms / 10);

        $hours = intdiv($totalCs, 360000);
        $totalCs -= $hours * 360000;

        $minutes = intdiv($totalCs, 6000);
        $totalCs -= $minutes * 6000;

        $seconds = intdiv($totalCs, 100);
        $centis = $totalCs - $seconds * 100;

        return sprintf('%d:%02d:%02d.%02d', $hours, $minutes, $seconds, $centis);
    }

    /**
     * Escape text for ASS dialogue: backslashes, override braces, and newlines.
     */
    public function escapeText(string $text): string
    {
        $text = str_replace('\\', '\\\\', $text);
        $text = str_replace(['{', '}'], ['\\{', '\\}'], $text);

        return preg_replace('/\r\n|\r|\n/', '\\N', $text) ?? $text;
    }
}
