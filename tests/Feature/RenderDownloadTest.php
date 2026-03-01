<?php

use App\Models\Render;
use Illuminate\Support\Facades\Storage;

test('completed render can be downloaded', function () {
    Storage::fake('local');

    $render = Render::factory()->completed()->create();
    Storage::put($render->output_path, 'fake video content');

    $response = $this->actingAs($render->user)
        ->get(route('editor.renders.download', $render));

    $response->assertOk();
    $response->assertDownload($render->project->name.'.mp4');
});

test('incomplete render returns 404', function () {
    $render = Render::factory()->processing()->create();

    $response = $this->actingAs($render->user)
        ->get(route('editor.renders.download', $render));

    $response->assertNotFound();
});
