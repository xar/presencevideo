<?php

namespace App\Video\Composition\Data;

readonly class StyleData implements SerializesToArray
{
    public function __construct(
        public int $fontSize,
        public string $fontColor = '#ffffff',
        public ?string $backgroundColor = null,
        public ?string $fontWeight = null,
        public ?string $textAlign = null,
        public ?string $position = null,
        public ?string $strokeColor = null,
        public int $strokeWidth = 0,
    ) {}

    public static function headline(): self
    {
        return new self(fontSize: 72, fontColor: '#ffffff', fontWeight: 'bold', textAlign: 'center', strokeColor: '#000000', strokeWidth: 4);
    }

    public static function caption(): self
    {
        return new self(fontSize: 42, fontColor: '#ffffff', backgroundColor: '#00000080', textAlign: 'center');
    }

    public static function subtitle(): self
    {
        return new self(fontSize: 48, fontColor: '#ffffff', backgroundColor: '#00000080', position: 'bottom');
    }

    public static function lowerThird(): self
    {
        return new self(fontSize: 36, fontColor: '#ffffff', backgroundColor: '#00000099', textAlign: 'left');
    }

    public function toArray(): array
    {
        return array_filter([
            'font_size' => $this->fontSize,
            'font_color' => $this->fontColor,
            'background_color' => $this->backgroundColor,
            'font_weight' => $this->fontWeight,
            'text_align' => $this->textAlign,
            'position' => $this->position,
            'stroke_color' => $this->strokeColor,
            'stroke_width' => $this->strokeWidth,
        ], fn (mixed $value): bool => $value !== null);
    }
}
