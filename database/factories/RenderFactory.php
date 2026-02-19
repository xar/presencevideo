<?php

namespace Database\Factories;

use App\Enums\RenderStatus;
use App\Models\Project;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Render>
 */
class RenderFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $user = User::factory();

        return [
            'user_id' => $user,
            'project_id' => Project::factory()->state(['user_id' => $user]),
            'status' => RenderStatus::Queued,
            'progress' => 0,
        ];
    }

    public function forProject(Project $project): static
    {
        return $this->state(fn (array $attributes) => [
            'project_id' => $project->id,
            'user_id' => $project->user_id,
        ]);
    }

    public function processing(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => RenderStatus::Processing,
            'progress' => fake()->numberBetween(10, 80),
            'started_at' => now(),
        ]);
    }

    public function completed(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => RenderStatus::Completed,
            'progress' => 100,
            'output_path' => 'renders/'.fake()->uuid().'.mp4',
            'started_at' => now()->subMinutes(5),
            'completed_at' => now(),
        ]);
    }

    public function failed(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => RenderStatus::Failed,
            'error_message' => fake()->sentence(),
            'started_at' => now()->subMinutes(2),
            'completed_at' => now(),
        ]);
    }
}
