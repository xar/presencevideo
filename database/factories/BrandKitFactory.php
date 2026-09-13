<?php

namespace Database\Factories;

use App\Models\BrandKit;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<BrandKit>
 */
class BrandKitFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'name' => fake()->company().' brand',
            'colors' => [
                'primary' => '#ff3366',
                'secondary' => '#1f1f2e',
                'accent' => '#ffd166',
                'background' => '#0b0b12',
                'text' => '#ffffff',
                'caption_highlight' => '#ffd166',
            ],
            'fonts' => [
                'display' => 'Montserrat, sans-serif',
                'body' => 'Inter, sans-serif',
                'caption' => 'Poppins, sans-serif',
            ],
            'logos' => [],
            'watermark' => null,
            'intro_asset_id' => null,
            'outro_asset_id' => null,
            'voice' => null,
            'music' => null,
            'caption_preset' => 'bold-outline',
            'motion_preset' => null,
            'tone' => 'Confident, playful, short sentences.',
        ];
    }
}
