<?php

use App\Ai\Agents\GenericAgent;
use App\Ai\Tools\ComposeVideoProject;
use App\Ai\Tools\GenerateFalAsset;
use App\Ai\Tools\GetGenerationStatus;
use App\Ai\Tools\GetRenderStatus;
use App\Ai\Tools\ListVideoProjectAssets;
use App\Ai\Tools\RenderVideoProject;
use App\Jobs\ContinueAgentConversation;
use App\Jobs\RenderProject;
use App\Jobs\RunGeneration;
use App\Models\Asset;
use App\Models\Generation;
use App\Models\Project;
use App\Models\User;
use Illuminate\Support\Facades\Queue;
use Laravel\Ai\Tools\Request;

it('exposes video composition tools on the generic agent', function () {
    $user = User::factory()->create();

    $tools = collect((new GenericAgent)->forUser($user)->tools());

    expect($tools->first(fn ($tool) => $tool instanceof ListVideoProjectAssets))->not->toBeNull()
        ->and($tools->first(fn ($tool) => $tool instanceof ComposeVideoProject))->not->toBeNull()
        ->and($tools->first(fn ($tool) => $tool instanceof GenerateFalAsset))->not->toBeNull()
        ->and($tools->first(fn ($tool) => $tool instanceof RenderVideoProject))->not->toBeNull();
});

it('creates a user video project from a composition json tool call', function () {
    $user = User::factory()->create();

    $result = (new ComposeVideoProject($user))->handle(new Request([
        'name' => 'Agent launch video',
        'composition_json' => json_encode([
            'resolution_width' => 1080,
            'resolution_height' => 1920,
            'fps' => 30,
            'scenes' => [[
                'id' => 'scene-1',
                'name' => 'Hook',
                'duration_ms' => 3000,
                'background_color' => '#050816',
                'layers' => [[
                    'id' => 'layer-1',
                    'type' => 'text',
                    'text' => 'Composed by chat',
                    'x' => 80,
                    'y' => 220,
                    'width' => 920,
                    'height' => 260,
                    'font_size' => 72,
                    'stroke_color' => '#000000',
                    'stroke_width' => 4,
                    'z_index' => 1,
                ]],
            ]],
            'audio_tracks' => [],
            'video_tracks' => [],
            'subtitle_tracks' => [[
                'id' => 'subs-1',
                'name' => 'Captions',
                'entries' => [[
                    'id' => 'caption-1',
                    'start_ms' => 0,
                    'end_ms' => 1800,
                    'text' => 'First line',
                ]],
            ]],
        ], JSON_THROW_ON_ERROR),
    ]));

    $payload = json_decode((string) $result, true, flags: JSON_THROW_ON_ERROR);
    $project = Project::findOrFail($payload['project_id']);

    expect($project->user_id)->toBe($user->id)
        ->and($project->name)->toBe('Agent launch video')
        ->and($project->scenes)->toHaveCount(1)
        ->and($project->scenes[0]['layers'][0]['text'])->toBe('Composed by chat')
        ->and($project->subtitle_tracks[0]['entries'][0]['text'])->toBe('First line');
});

it('lists only assets belonging to the current user for video composition', function () {
    $user = User::factory()->create();
    $otherUser = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);
    $asset = Asset::factory()->create(['user_id' => $user->id, 'project_id' => $project->id, 'type' => 'image']);
    Asset::factory()->create(['user_id' => $otherUser->id, 'type' => 'image']);

    $result = (new ListVideoProjectAssets($user))->handle(new Request([
        'project_id' => $project->id,
        'type' => 'image',
    ]));

    $payload = json_decode((string) $result, true, flags: JSON_THROW_ON_ERROR);

    expect($payload)->toHaveCount(1)
        ->and($payload[0]['id'])->toBe($asset->id);
});

it('queues fal asset generation and exposes its status', function () {
    Queue::fake();

    $user = User::factory()->create();
    $project = Project::factory()->create([
        'user_id' => $user->id,
        'scenes' => [[
            'id' => 'scene_2',
            'name' => 'Scene 2',
            'duration_ms' => 3000,
            'layers' => [],
        ]],
    ]);

    $result = (new GenerateFalAsset($user, 'conversation-123'))->handle(new Request([
        'project_id' => $project->id,
        'type' => 'text_to_image',
        'prompt' => 'A cinematic product shot',
        'model_id' => 'fal-ai/flux/dev',
        'parameters_json' => '{"image_size":"portrait_16_9"}',
        'scene_id' => 'scene_2',
    ]));

    $payload = json_decode((string) $result, true, flags: JSON_THROW_ON_ERROR);

    Queue::assertPushed(RunGeneration::class);

    expect($payload['project_id'])->toBe($project->id)
        ->and($payload['type'])->toBe('text_to_image')
        ->and($payload['status'])->toBe('pending')
        ->and(Generation::find($payload['generation_id'])->scene_id)->toBeNull()
        ->and(Generation::find($payload['generation_id'])->parameters['agent_conversation_id'])->toBe('conversation-123');

    $status = (new GetGenerationStatus($user))->handle(new Request([
        'generation_id' => $payload['generation_id'],
    ]));

    $statusPayload = json_decode((string) $status, true, flags: JSON_THROW_ON_ERROR);

    expect($statusPayload['generation_id'])->toBe($payload['generation_id'])
        ->and($statusPayload['status'])->toBe('pending');
});

it('continues the agent conversation from an async completion job', function () {
    GenericAgent::fake(['Continuing workflow.']);

    $user = User::factory()->create();

    (new ContinueAgentConversation('conversation-123', $user->id, 'Generation completed.'))->handle();

    GenericAgent::assertQueued('Generation completed.');
});

it('queues rendering and exposes render status', function () {
    Queue::fake();

    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $result = (new RenderVideoProject($user))->handle(new Request([
        'project_id' => $project->id,
    ]));

    $payload = json_decode((string) $result, true, flags: JSON_THROW_ON_ERROR);

    Queue::assertPushed(RenderProject::class);

    $status = (new GetRenderStatus($user))->handle(new Request([
        'render_id' => $payload['render_id'],
    ]));

    $statusPayload = json_decode((string) $status, true, flags: JSON_THROW_ON_ERROR);

    expect($statusPayload['render_id'])->toBe($payload['render_id'])
        ->and($statusPayload['status'])->toBe('queued')
        ->and($statusPayload['progress'])->toBe(0);
});
