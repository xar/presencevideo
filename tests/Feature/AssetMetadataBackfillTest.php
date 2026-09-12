<?php

use App\Enums\AssetType;
use App\Jobs\ProcessAssetUpload;
use App\Models\Asset;
use App\Models\Generation;
use App\Models\Project;
use App\Models\User;
use App\Services\FalAI\FalClient;
use App\Services\FalAI\ModelRegistry;
use App\Services\FalAIService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;

test('a generated asset is queued for probing so it gets a duration and a poster frame', function () {
    Queue::fake();
    Storage::fake('local');
    config(['filesystems.default' => 'local']);

    $generation = Generation::factory()->create(['prompt' => 'a drone shot']);

    $client = Mockery::mock(FalClient::class);
    $client->shouldReceive('downloadFile')->once()->andReturn('fake-audio-bytes');

    $registry = Mockery::mock(ModelRegistry::class);

    $service = new FalAIService($client, $registry);
    $method = new ReflectionMethod($service, 'downloadAndSaveAsset');
    $asset = $method->invoke($service, 'https://fal.example/audio.mp3', $generation, AssetType::Audio, 'mp3');

    expect($asset->duration_ms)->toBeNull();
    Queue::assertPushed(ProcessAssetUpload::class, fn (ProcessAssetUpload $job) => $job->asset->is($asset));
});

test('the backfill command queues only assets that are missing metadata', function () {
    Queue::fake();

    $incomplete = Asset::factory()->video()->create(['duration_ms' => null, 'thumbnail_path' => null]);
    $complete = Asset::factory()->video()->create([
        'duration_ms' => 5000,
        'width' => 1920,
        'height' => 1080,
        'thumbnail_path' => 'assets/thumb.jpg',
    ]);

    $this->artisan('assets:backfill-metadata')->assertSuccessful();

    Queue::assertPushed(ProcessAssetUpload::class, 1);
    Queue::assertPushed(ProcessAssetUpload::class, fn (ProcessAssetUpload $job) => $job->asset->is($incomplete));
    expect($complete->fresh()->duration_ms)->toBe(5000);
});

test('an mp4 upload is accepted and queued for processing', function () {
    Queue::fake();
    Storage::fake('local');
    config(['filesystems.default' => 'local']);

    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);

    $response = $this->actingAs($user)->post(
        route('editor.assets.store', $project),
        [
            'file' => UploadedFile::fake()->create('clip.mp4', 2048, 'video/mp4'),
            'type' => 'video',
            'duration_ms' => 10125,
            'width' => 1080,
            'height' => 1920,
        ],
        ['Accept' => 'application/json'],
    );

    $response->assertCreated()
        ->assertJsonPath('asset.type', 'video')
        ->assertJsonPath('asset.duration_ms', 10125);

    Queue::assertPushed(ProcessAssetUpload::class);
});
