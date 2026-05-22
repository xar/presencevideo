<?php

namespace App\Console\Commands;

use App\Enums\GenerationStatus;
use App\Enums\GenerationType;
use App\Enums\RenderStatus;
use App\Jobs\RenderProject;
use App\Models\Asset;
use App\Models\Generation;
use App\Models\Project;
use App\Models\Render;
use App\Models\User;
use App\Services\FalAIService;
use App\Video\Composition\Data\StyleData;
use App\Video\Composition\ProjectComposer;
use App\Video\Composition\Timeline;
use Illuminate\Console\Command;

class CreateCompositionShowcase extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'video:composition-showcase
                            {--user= : Existing user email to own the project}
                            {--render : Render the finished showcase synchronously}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Generate fal.ai assets, compose a complete project with primitives, and optionally render it.';

    /**
     * Execute the console command.
     */
    public function handle(FalAIService $falAI): int
    {
        $user = $this->resolveUser();

        $project = Project::create([
            'user_id' => $user->id,
            'name' => 'Composition Primitives Showcase',
            'resolution_width' => 1080,
            'resolution_height' => 1920,
            'fps' => 30,
            'scenes' => [],
            'audio_tracks' => [],
            'video_tracks' => [],
            'subtitle_tracks' => [],
        ]);

        $this->info("Created project #{$project->id}: {$project->name}");

        $assets = collect([
            $this->generateImage($falAI, $project, 'A cinematic vertical frame of a Laravel-powered AI video editor timeline, glowing glass UI, code transforming into a finished social video, premium product demo style, no readable text'),
            $this->generateImage($falAI, $project, 'A polished vertical storyboard scene showing layered video composition primitives: images, typography, captions, audio waveforms, elegant dark interface, no readable text'),
            $this->generateImage($falAI, $project, 'A dramatic vertical final export moment: beautiful generated video preview on a phone, floating media layers, cinematic lighting, professional SaaS launch visual, no readable text'),
        ])->filter();

        if ($assets->count() < 1) {
            $this->error('No fal.ai assets were generated, cannot compose showcase.');

            return self::FAILURE;
        }

        $composer = ProjectComposer::for($project)->resolution(1080, 1920)->fps(30);

        $headlines = [
            'Laravel now has video primitives',
            'Scenes, layers, tracks, captions',
            'Programmatic full-video creation',
        ];

        $subtitles = [
            'This project was composed entirely from backend primitives.',
            'Each scene uses reusable layout, text, and timeline helpers.',
            'The same API can now power templates and automated video generation.',
        ];

        foreach ($assets->values() as $index => $asset) {
            $scene = $composer->scene('Showcase '.($index + 1))->duration(3000)->background('#050816');
            $scene->image($asset)->cover()->zIndex(0);
            $scene->text($headlines[$index] ?? 'Composable video generation')
                ->position(80, 220)
                ->size(920, 260)
                ->fontSize(68)
                ->stroke('#000000', 5)
                ->zIndex(1);
        }

        $composer->videoTrack('Persistent badge')
            ->text('Built with ProjectComposer')
            ->position(90, 1540)
            ->size(900, 120)
            ->fontSize(42)
            ->stroke('#000000', 3);

        $captions = $composer->subtitles('Narrative captions')->style(StyleData::subtitle());
        foreach ($subtitles as $index => $subtitle) {
            $captions->entry($index * 3000, (($index + 1) * 3000) - 250, $subtitle);
        }

        $project = $composer->save();
        $this->info('Composed project document.');
        $this->line('Scenes: '.count($project->scenes));
        $this->line('Video tracks: '.count($project->video_tracks));
        $this->line('Subtitle tracks: '.count($project->subtitle_tracks));
        $this->line('Duration: '.Timeline::totalDuration($project).'ms');

        if (! $this->option('render')) {
            $this->warn('Skipped render. Re-run with --render to create the MP4.');

            return self::SUCCESS;
        }

        $render = Render::create([
            'project_id' => $project->id,
            'user_id' => $user->id,
            'status' => RenderStatus::Queued,
            'progress' => 0,
        ]);

        $this->info("Rendering synchronously as render #{$render->id}...");
        (new RenderProject($render))->handle(app(\App\Services\FFmpegService::class));

        $render->refresh();

        if (! $render->isComplete()) {
            $this->error('Render failed: '.($render->error_message ?? 'Unknown error'));

            return self::FAILURE;
        }

        $this->info('Render complete.');
        $this->line('Project ID: '.$project->id);
        $this->line('Render ID: '.$render->id);
        $this->line('Output path: storage/app/private/'.$render->output_path);

        return self::SUCCESS;
    }

    protected function resolveUser(): User
    {
        $email = $this->option('user');

        if (is_string($email) && $email !== '') {
            $user = User::where('email', $email)->first();

            if ($user) {
                return $user;
            }
        }

        return User::first() ?? User::factory()->create([
            'name' => 'Video Composition Demo',
            'email' => 'video-composition-demo@example.com',
        ]);
    }

    protected function generateImage(FalAIService $falAI, Project $project, string $prompt): ?Asset
    {
        $this->line('Generating image with fal.ai...');

        $generation = Generation::create([
            'user_id' => $project->user_id,
            'project_id' => $project->id,
            'type' => GenerationType::TextToImage,
            'provider' => 'fal.ai',
            'model' => 'fal-ai/flux/dev',
            'prompt' => $prompt,
            'parameters' => [
                'model_key' => 'fal-ai/flux/dev',
                'image_size' => 'portrait_16_9',
                'num_images' => 1,
                'num_inference_steps' => 28,
            ],
            'status' => GenerationStatus::Processing,
            'alternatives' => [],
        ]);

        $result = $falAI->generate($generation);

        if (! $result->success || ! $result->assetId) {
            $generation->update([
                'status' => GenerationStatus::Failed,
                'error_message' => $result->error,
            ]);
            $this->error('fal.ai generation failed: '.($result->error ?? 'Unknown error'));

            return null;
        }

        $generation->update([
            'status' => GenerationStatus::Completed,
            'output_asset_id' => $result->assetId,
            'fal_request_id' => $result->requestId,
            'alternatives' => $result->alternatives,
        ]);

        $asset = Asset::find($result->assetId);
        $this->info("Generated asset #{$asset?->id}: {$asset?->name}");

        return $asset;
    }
}
