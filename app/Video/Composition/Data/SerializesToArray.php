<?php

namespace App\Video\Composition\Data;

interface SerializesToArray
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(): array;
}
