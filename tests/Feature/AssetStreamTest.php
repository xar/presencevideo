<?php

use App\Models\Asset;
use App\Models\Project;
use Illuminate\Support\Facades\Storage;

it('serves local video assets with byte range support', function () {
    Storage::fake('local');

    $project = Project::factory()->create();
    $content = str_repeat('0123456789', 100);
    Storage::disk('local')->put('assets/test-video.mp4', $content);

    $asset = Asset::factory()
        ->forProject($project)
        ->video()
        ->create([
            'disk' => 'local',
            'path' => 'assets/test-video.mp4',
            'mime_type' => 'video/mp4',
            'size_bytes' => strlen($content),
        ]);

    $this->actingAs($project->user)
        ->withHeader('Range', 'bytes=0-99')
        ->get(route('editor.assets.stream', $asset))
        ->assertStatus(206)
        ->assertHeader('accept-ranges', 'bytes')
        ->assertHeader('content-type', 'video/mp4');
});
