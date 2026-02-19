<?php

namespace Database\Factories;

use App\Enums\ProjectStatus;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Project>
 */
class ProjectFactory extends Factory
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
            'name' => fake()->words(3, true),
            'resolution_width' => 1080,
            'resolution_height' => 1920,
            'fps' => 30,
            'scenes' => [],
            'audio_tracks' => [],
            'status' => ProjectStatus::Draft,
        ];
    }

    public function landscape(): static
    {
        return $this->state(fn (array $attributes) => [
            'resolution_width' => 1920,
            'resolution_height' => 1080,
        ]);
    }

    public function square(): static
    {
        return $this->state(fn (array $attributes) => [
            'resolution_width' => 1080,
            'resolution_height' => 1080,
        ]);
    }

    public function rendering(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => ProjectStatus::Rendering,
        ]);
    }

    public function completed(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => ProjectStatus::Completed,
        ]);
    }
}
