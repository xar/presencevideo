<?php

namespace Database\Factories;

use App\Enums\GenerationStatus;
use App\Enums\GenerationType;
use App\Models\Project;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Generation>
 */
class GenerationFactory extends Factory
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
            'scene_id' => Str::uuid()->toString(),
            'step_index' => 0,
            'type' => GenerationType::TextToImage,
            'provider' => 'fal',
            'model' => 'fal-ai/flux/schnell',
            'prompt' => fake()->sentence(),
            'parameters' => [],
            'status' => GenerationStatus::Pending,
            'alternatives' => [],
        ];
    }

    public function forProject(Project $project): static
    {
        return $this->state(fn (array $attributes) => [
            'project_id' => $project->id,
            'user_id' => $project->user_id,
        ]);
    }

    public function textToImage(): static
    {
        return $this->state(fn (array $attributes) => [
            'type' => GenerationType::TextToImage,
            'model' => 'fal-ai/flux/schnell',
        ]);
    }

    public function imageToVideo(): static
    {
        return $this->state(fn (array $attributes) => [
            'type' => GenerationType::ImageToVideo,
            'model' => 'fal-ai/kling-video/v1.5/pro/image-to-video',
        ]);
    }

    public function textToMusic(): static
    {
        return $this->state(fn (array $attributes) => [
            'type' => GenerationType::TextToMusic,
            'model' => 'fal-ai/stable-audio',
        ]);
    }

    public function textToSpeech(): static
    {
        return $this->state(fn (array $attributes) => [
            'type' => GenerationType::TextToSpeech,
            'model' => 'fal-ai/f5-tts',
        ]);
    }

    public function speechToText(): static
    {
        return $this->state(fn (array $attributes) => [
            'type' => GenerationType::SpeechToText,
            'model' => 'fal-ai/wizper',
            'prompt' => '',
        ]);
    }

    public function processing(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => GenerationStatus::Processing,
            'fal_request_id' => Str::uuid()->toString(),
        ]);
    }

    public function completed(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => GenerationStatus::Completed,
        ]);
    }

    public function failed(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => GenerationStatus::Failed,
            'error_message' => fake()->sentence(),
        ]);
    }
}
