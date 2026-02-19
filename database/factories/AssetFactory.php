<?php

namespace Database\Factories;

use App\Enums\AssetSource;
use App\Enums\AssetType;
use App\Models\Project;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Asset>
 */
class AssetFactory extends Factory
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
            'project_id' => null,
            'type' => AssetType::Image,
            'source' => AssetSource::Upload,
            'name' => fake()->words(2, true).'.jpg',
            'path' => 'assets/'.fake()->uuid().'.jpg',
            'disk' => 'local',
            'mime_type' => 'image/jpeg',
            'size_bytes' => fake()->numberBetween(10000, 5000000),
            'width' => 1920,
            'height' => 1080,
            'metadata' => [],
        ];
    }

    public function forProject(Project $project): static
    {
        return $this->state(fn (array $attributes) => [
            'project_id' => $project->id,
            'user_id' => $project->user_id,
        ]);
    }

    public function video(): static
    {
        return $this->state(fn (array $attributes) => [
            'type' => AssetType::Video,
            'name' => fake()->words(2, true).'.mp4',
            'path' => 'assets/'.fake()->uuid().'.mp4',
            'mime_type' => 'video/mp4',
            'duration_ms' => fake()->numberBetween(1000, 60000),
        ]);
    }

    public function audio(): static
    {
        return $this->state(fn (array $attributes) => [
            'type' => AssetType::Audio,
            'name' => fake()->words(2, true).'.mp3',
            'path' => 'assets/'.fake()->uuid().'.mp3',
            'mime_type' => 'audio/mpeg',
            'duration_ms' => fake()->numberBetween(1000, 180000),
            'width' => null,
            'height' => null,
        ]);
    }

    public function generated(): static
    {
        return $this->state(fn (array $attributes) => [
            'source' => AssetSource::Generated,
        ]);
    }
}
