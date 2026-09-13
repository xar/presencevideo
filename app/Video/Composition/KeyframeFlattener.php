<?php

namespace App\Video\Composition;

/**
 * TEMPORARY BRIDGE — dies with the legacy FFmpeg renderer.
 *
 * FFmpeg's filters take CONSTANT parameters, so the server renderer cannot
 * animate anything. Before this class existed it simply read the static
 * property off an element and ignored `keyframes` entirely, which made every
 * agent-authored fade render invisible: a text layer stored as `opacity: 0`
 * with an opacity track fading it up emitted `colorchannelmixer=aa=0` and was
 * never seen, while the browser compositor showed it correctly.
 *
 * This flattens each animated property to ONE static value, sampled at the
 * element's temporal midpoint. For the overwhelmingly common
 * fade-in / hold / fade-out shape the midpoint lands on the fully visible hold,
 * and it generalises sensibly to position, scale and rotation drifts. It is an
 * APPROXIMATION, not animation, and it is only here so that agent-authored
 * videos are not missing their text on the server render.
 *
 * DELIBERATE, DOCUMENTED EXCEPTION to CLAUDE.md's "extend the primitive, never
 * copy" rule: this is a second, cruder keyframe sampler alongside the real one
 * in `resources/js/lib/editor/model/keyframes.ts`. It is kept deliberately tiny
 * and self-contained so that it can be deleted in one move when the legacy
 * renderer is replaced by headless Chrome running the TS compositor. Do not
 * grow it, and do not add features to it.
 */
final class KeyframeFlattener
{
    /**
     * Property paths that may be animated, mirroring `ANIMATABLE_PROPERTY` in
     * `keyframes.ts`. Addressed exactly as they are stored on the element, so
     * the dotted `adjustments.*` paths are written nested.
     *
     * @var list<string>
     */
    private const ANIMATABLE_PROPERTIES = [
        'x',
        'y',
        'width',
        'height',
        'rotation',
        'opacity',
        'volume',
        'adjustments.brightness',
        'adjustments.contrast',
        'adjustments.saturation',
    ];

    /**
     * Return the element with its keyframed properties resolved to static
     * values sampled at the element's temporal midpoint.
     *
     * An element with no usable tracks is returned untouched, so un-animated
     * projects produce exactly the filtergraph they produced before this
     * existed. Production data contains unknown element types and
     * non-canonical values, so malformed or empty tracks must pass through
     * harmlessly rather than throw.
     *
     * @param  array<string, mixed>  $element
     * @return array<string, mixed>
     */
    public static function flatten(array $element): array
    {
        $tracks = $element['keyframes'] ?? null;
        if (! is_array($tracks) || $tracks === []) {
            return $element;
        }

        $durationMs = self::elementDurationMs($element);

        foreach (self::ANIMATABLE_PROPERTIES as $path) {
            $keyframes = self::usableKeyframes($tracks[$path] ?? null);
            if ($keyframes === []) {
                continue;
            }

            $sampleMs = $durationMs !== null
                ? $durationMs / 2
                // No usable element duration: fall back to the midpoint of the
                // track's own authored range, which is still the "hold" for a
                // fade in/out shape.
                : $keyframes[count($keyframes) - 1]['time_ms'] / 2;

            $element = self::writePath($element, $path, self::sample($keyframes, $sampleMs));
        }

        return $element;
    }

    /**
     * Element-local duration, or null when none can be derived.
     *
     * @param  array<string, mixed>  $element
     */
    private static function elementDurationMs(array $element): ?float
    {
        $start = $element['start_ms'] ?? null;
        $end = $element['end_ms'] ?? null;

        if (is_numeric($start) && is_numeric($end) && (float) $end > (float) $start) {
            return (float) $end - (float) $start;
        }

        $duration = $element['duration_ms'] ?? null;
        if (is_numeric($duration) && (float) $duration > 0) {
            return (float) $duration;
        }

        return null;
    }

    /**
     * Drop anything that is not a `{time_ms, value}` pair and sort by time.
     *
     * @return list<array{time_ms: float, value: float, easing: mixed}>
     */
    private static function usableKeyframes(mixed $keyframes): array
    {
        if (! is_array($keyframes)) {
            return [];
        }

        $usable = [];

        foreach ($keyframes as $keyframe) {
            if (! is_array($keyframe) || ! is_numeric($keyframe['time_ms'] ?? null) || ! is_numeric($keyframe['value'] ?? null)) {
                continue;
            }

            $usable[] = [
                'time_ms' => (float) $keyframe['time_ms'],
                'value' => (float) $keyframe['value'],
                'easing' => $keyframe['easing'] ?? null,
            ];
        }

        usort($usable, fn (array $a, array $b): int => $a['time_ms'] <=> $b['time_ms']);

        return $usable;
    }

    /**
     * Sample a sorted track at an element-local time.
     *
     * Linear interpolation between the two surrounding keyframes; `hold` keeps
     * the earlier value until the next keyframe; outside the authored range the
     * first/last value is held. Every OTHER easing curve is approximated as
     * linear — acceptable precisely because this takes a single static sample
     * rather than animating, so the curve shape between keyframes is
     * unobservable in the output.
     *
     * @param  non-empty-list<array{time_ms: float, value: float, easing: mixed}>  $keyframes
     */
    private static function sample(array $keyframes, float $timeMs): float
    {
        $first = $keyframes[0];
        if ($timeMs <= $first['time_ms']) {
            return $first['value'];
        }

        $last = $keyframes[count($keyframes) - 1];
        if ($timeMs >= $last['time_ms']) {
            return $last['value'];
        }

        // The LAST keyframe at or before the sample time wins, so keyframes
        // stacked on the same millisecond read as an instant cut.
        $index = 0;
        foreach ($keyframes as $i => $keyframe) {
            if ($keyframe['time_ms'] > $timeMs) {
                break;
            }
            $index = $i;
        }

        $from = $keyframes[$index];
        $to = $keyframes[$index + 1] ?? null;

        if ($to === null || $from['easing'] === 'hold') {
            return $from['value'];
        }

        $span = $to['time_ms'] - $from['time_ms'];
        if ($span <= 0) {
            return $to['value'];
        }

        return $from['value'] + ($to['value'] - $from['value']) * (($timeMs - $from['time_ms']) / $span);
    }

    /**
     * Write a dotted property path onto the element, creating the intermediate
     * array when the element has no `adjustments` yet.
     *
     * @param  array<string, mixed>  $element
     * @return array<string, mixed>
     */
    private static function writePath(array $element, string $path, float $value): array
    {
        $segments = explode('.', $path);

        if (count($segments) === 1) {
            $element[$segments[0]] = $value;

            return $element;
        }

        [$container, $key] = $segments;
        $nested = $element[$container] ?? null;
        $nested = is_array($nested) ? $nested : [];
        $nested[$key] = $value;
        $element[$container] = $nested;

        return $element;
    }
}
