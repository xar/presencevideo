<?php

namespace App\Enums;

/**
 * Scene transition types. Every case maps 1:1 to an ffmpeg `xfade` transition
 * name, so the backing value can be used directly in a filtergraph.
 */
enum TransitionType: string
{
    case Fade = 'fade';
    case FadeBlack = 'fadeblack';
    case FadeWhite = 'fadewhite';
    case SlideLeft = 'slideleft';
    case SlideRight = 'slideright';
    case SlideUp = 'slideup';
    case SlideDown = 'slidedown';
    case WipeLeft = 'wipeleft';
    case WipeRight = 'wiperight';
    case CircleOpen = 'circleopen';
    case CircleClose = 'circleclose';
    case Dissolve = 'dissolve';

    /**
     * @return array<int, string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }

    /**
     * Resolve a (possibly unknown) transition name, falling back to a plain fade.
     */
    public static function fromNameOrFade(mixed $name): self
    {
        return is_string($name)
            ? (self::tryFrom($name) ?? self::Fade)
            : self::Fade;
    }
}
