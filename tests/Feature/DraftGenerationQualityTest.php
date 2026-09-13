<?php

use App\Ai\Tools\GenerateFalAsset;
use App\Ai\Tools\RegenerateAtFullQuality;
use App\Ai\VideoTemplateInstructions;
use App\Enums\GenerationStatus;
use App\Enums\GenerationType;
use App\Jobs\RunGeneration;
use App\Models\Generation;
use App\Models\Project;
use App\Models\User;
use App\Services\FalAI\DraftQuality;
use App\Services\FalAIService;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Support\Facades\Queue;
use Laravel\Ai\Tools\Request;

function videoModelConfig(): array
{
    return [
        'id' => 'minimax/h3-max/image-to-video',
        'name' => 'H3 Max Image to Video',
        'description' => '',
        'parameters' => [
            'resolution' => [
                'type' => 'select',
                'options' => ['480P' => '480P', '768P' => '768P', '1080P' => '1080P'],
            ],
            'duration' => ['type' => 'slider', 'min' => 5, 'max' => 15],
        ],
        'defaults' => ['resolution' => '768P', 'duration' => 5],
    ];
}

function draftGeneration(array $parameters, GenerationType $type = GenerationType::ImageToVideo): Generation
{
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    return Generation::make([
        'user_id' => $user->id,
        'project_id' => $project->id,
        'type' => $type,
        'provider' => 'fal',
        'prompt' => 'a storm at sea',
        'parameters' => $parameters,
    ]);
}

function buildInputFor(Generation $generation, array $modelConfig): array
{
    $service = app(FalAIService::class);

    return (new ReflectionMethod($service, 'buildModelInput'))->invokeArgs($service, [$generation, $modelConfig]);
}

it('runs a draft at the cheapest resolution the model offers', function () {
    $input = buildInputFor(draftGeneration(['quality_tier' => 'draft']), videoModelConfig());

    expect($input['resolution'])->toBe('480P');
});

it('caps the resolution even when the agent asked for a higher one', function () {
    $input = buildInputFor(
        draftGeneration(['quality_tier' => 'draft', 'resolution' => '1080P']),
        videoModelConfig(),
    );

    expect($input['resolution'])->toBe('480P');
});

it('keeps the model default resolution when the generation is not a draft', function () {
    $input = buildInputFor(draftGeneration([]), videoModelConfig());

    expect($input['resolution'])->toBe('768P');
});

it('leaves duration and prompt alone so a draft previews the real shot', function () {
    $input = buildInputFor(draftGeneration(['quality_tier' => 'draft']), videoModelConfig());

    expect($input['duration'])->toBe(5)
        ->and($input['prompt'])->toBe('a storm at sea');
});

it('never sends the internal quality_tier key to fal', function () {
    $input = buildInputFor(draftGeneration(['quality_tier' => 'draft']), videoModelConfig());

    expect($input)->not->toHaveKey('quality_tier');
});

it('leaves a model whose schema we never fetched untouched', function () {
    $input = buildInputFor(
        draftGeneration(['quality_tier' => 'draft']),
        ['id' => 'vendor/unknown', 'name' => '', 'description' => '', 'parameters' => [], 'defaults' => []],
    );

    expect($input)->not->toHaveKey('resolution');
});

it('matches a ladder value against the spelling the model actually uses', function () {
    $downgraded = DraftQuality::downgrade(
        [],
        ['resolution' => ['type' => 'select', 'options' => ['480p' => '480p', '1080p' => '1080p']]],
        ['resolution' => ['360P', '480P']],
    );

    expect($downgraded['resolution'])->toBe('480p');
});

it('skips a ladder parameter the model does not offer any listed value for', function () {
    $downgraded = DraftQuality::downgrade(
        [],
        ['resolution' => ['type' => 'select', 'options' => ['4k' => '4k']]],
        ['resolution' => ['480p']],
    );

    expect($downgraded)->not->toHaveKey('resolution');
});

it('queues agent generations as drafts by default', function () {
    Queue::fake();
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    (new GenerateFalAsset($user, null))->handle(new Request([
        'project_id' => $project->id,
        'type' => 'image_to_video',
        'prompt' => 'a storm at sea',
        'model_id' => 'minimax/h3-max/image-to-video',
    ]));

    expect(Generation::latest('id')->first()->parameters['quality_tier'])->toBe('draft');
});

it('lets the agent opt a generation out of the draft tier', function () {
    Queue::fake();
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    (new GenerateFalAsset($user, null))->handle(new Request([
        'project_id' => $project->id,
        'type' => 'image_to_video',
        'prompt' => 'a storm at sea',
        'model_id' => 'minimax/h3-max/image-to-video',
        'quality_tier' => 'final',
    ]));

    expect(Generation::latest('id')->first()->parameters)->not->toHaveKey('quality_tier');
});

it('queues at full quality when draft generations are switched off', function () {
    config()->set('agent_video_templates.draft_generations.enabled', false);

    Queue::fake();
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    (new GenerateFalAsset($user, null))->handle(new Request([
        'project_id' => $project->id,
        'type' => 'image_to_video',
        'prompt' => 'a storm at sea',
        'model_id' => 'minimax/h3-max/image-to-video',
    ]));

    expect(Generation::latest('id')->first()->parameters)->not->toHaveKey('quality_tier');
});

it('re-runs an approved draft with the same model and prompt at full quality', function () {
    Queue::fake();
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $draft = Generation::create([
        'user_id' => $user->id,
        'project_id' => $project->id,
        'type' => GenerationType::ImageToVideo,
        'provider' => 'fal',
        'model' => 'minimax/h3-max/image-to-video',
        'prompt' => 'a storm at sea',
        'parameters' => [
            'quality_tier' => 'draft',
            'model_key' => 'minimax/h3-max/image-to-video',
            'aspect_ratio' => '9:16',
            'agent_activity_id' => 12,
        ],
        'status' => GenerationStatus::Completed,
    ]);

    (new RegenerateAtFullQuality($user, null))->handle(new Request(['generation_id' => $draft->id]));

    $rerun = Generation::latest('id')->first();

    expect($rerun->id)->not->toBe($draft->id)
        ->and($rerun->model)->toBe('minimax/h3-max/image-to-video')
        ->and($rerun->prompt)->toBe('a storm at sea')
        ->and($rerun->parameters['model_key'])->toBe('minimax/h3-max/image-to-video')
        ->and($rerun->parameters['aspect_ratio'])->toBe('9:16')
        ->and($rerun->parameters)->not->toHaveKeys(['quality_tier', 'agent_activity_id'])
        ->and($rerun->status)->toBe(GenerationStatus::Pending);

    Queue::assertPushed(RunGeneration::class);
});

it('will not re-run another user\'s generation', function () {
    Queue::fake();
    $owner = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $owner->id]);

    $draft = Generation::create([
        'user_id' => $owner->id,
        'project_id' => $project->id,
        'type' => GenerationType::ImageToVideo,
        'provider' => 'fal',
        'model' => 'minimax/h3-max/image-to-video',
        'prompt' => 'a storm at sea',
        'parameters' => ['quality_tier' => 'draft'],
        'status' => GenerationStatus::Completed,
    ]);

    (new RegenerateAtFullQuality(User::factory()->create(), null))->handle(new Request(['generation_id' => $draft->id]));
})->throws(ModelNotFoundException::class);

it('tells both agents that generations are drafts and how to upgrade them', function () {
    foreach ([VideoTemplateInstructions::forCreatorAgent(), VideoTemplateInstructions::forGenericAgent()] as $instructions) {
        expect($instructions)->toContain('DRAFT')
            ->and($instructions)->toContain('regenerate_at_full_quality');
    }
});
