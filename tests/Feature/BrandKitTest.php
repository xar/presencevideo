<?php

use App\Models\Asset;
use App\Models\BrandKit;
use App\Models\Project;
use App\Models\User;
use App\Services\HeadlessRender\HeadlessRenderPayload;

test('guests cannot view brand kits', function () {
    $this->get(route('editor.brand-kits.index'))->assertRedirect(route('login'));
});

test('users see only their own brand kits', function () {
    $user = User::factory()->create();
    $mine = BrandKit::factory()->for($user)->create(['name' => 'Mine']);
    BrandKit::factory()->create(['name' => 'Theirs']);

    $this->actingAs($user)
        ->get(route('editor.brand-kits.index'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('brand-kits/Index')
            ->has('brandKits', 1)
            ->where('brandKits.0.id', $mine->id)
            ->where('brandKits.0.colors.primary', '#ff3366')
            ->where('brandKits.0.watermark', null)
            ->where('brandKits.0.intro_asset_id', null));
});

test('users can create a brand kit with roles and assets they own', function () {
    $user = User::factory()->create();
    $logo = Asset::factory()->create(['user_id' => $user->id]);

    $this->actingAs($user)->post(route('editor.brand-kits.store'), [
        'name' => 'Acme',
        'colors' => ['primary' => '#ff0000', 'text' => '#ffffff'],
        'fonts' => ['display' => 'Bebas Neue, sans-serif'],
        'logos' => ['mark' => $logo->id],
        'watermark' => ['asset_id' => $logo->id, 'position' => 'bottom-right', 'opacity' => 0.5, 'size' => 0.1],
        'voice' => ['model_id' => 'fal-ai/minimax/speech-2.8-turbo', 'voice_id' => 'Wise_Woman'],
        'music' => ['mood' => 'upbeat'],
        'caption_preset' => 'bold-outline',
        'tone' => 'Short and punchy.',
    ])->assertRedirect();

    $kit = BrandKit::query()->where('user_id', $user->id)->firstOrFail();

    expect($kit->name)->toBe('Acme')
        ->and($kit->colors)->toBe(['primary' => '#ff0000', 'text' => '#ffffff'])
        ->and($kit->fonts)->toBe(['display' => 'Bebas Neue, sans-serif'])
        ->and($kit->logos)->toBe(['mark' => $logo->id])
        ->and($kit->watermark['position'])->toBe('bottom-right')
        ->and($kit->voice['voice_id'])->toBe('Wise_Woman')
        ->and($kit->tone)->toBe('Short and punchy.');
});

test('brand kit colours must be hex and assets must belong to the user', function () {
    $user = User::factory()->create();
    $foreignAsset = Asset::factory()->create();

    $this->actingAs($user)->post(route('editor.brand-kits.store'), [
        'name' => 'Bad',
        'colors' => ['primary' => 'red'],
        'logos' => ['mark' => $foreignAsset->id],
    ])->assertSessionHasErrors(['colors.primary', 'logos.mark']);
});

test('users can update and delete only their own brand kits', function () {
    $owner = User::factory()->create();
    $other = User::factory()->create();
    $kit = BrandKit::factory()->for($owner)->create(['name' => 'Before']);

    $this->actingAs($other)
        ->put(route('editor.brand-kits.update', $kit), ['name' => 'Hijacked'])
        ->assertForbidden();

    $this->actingAs($other)
        ->delete(route('editor.brand-kits.destroy', $kit))
        ->assertForbidden();

    $this->actingAs($owner)
        ->put(route('editor.brand-kits.update', $kit), ['name' => 'After', 'colors' => ['accent' => '#00ff00']])
        ->assertRedirect();

    expect($kit->fresh()->name)->toBe('After')
        ->and($kit->fresh()->colors)->toBe(['accent' => '#00ff00']);

    $this->actingAs($owner)->delete(route('editor.brand-kits.destroy', $kit))->assertRedirect();

    $this->assertDatabaseMissing('brand_kits', ['id' => $kit->id]);
});

test('a project can attach one of the user\'s own brand kits and detach it again', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);
    $kit = BrandKit::factory()->for($user)->create();

    $this->actingAs($user)
        ->put(route('editor.projects.update', $project), ['brand_kit_id' => $kit->id])
        ->assertRedirect();

    expect($project->fresh()->brand_kit_id)->toBe($kit->id)
        ->and($project->fresh()->brandKit->id)->toBe($kit->id);

    $this->actingAs($user)
        ->put(route('editor.projects.update', $project), ['brand_kit_id' => null])
        ->assertRedirect();

    expect($project->fresh()->brand_kit_id)->toBeNull();
});

test('a project cannot attach another user\'s brand kit', function () {
    $user = User::factory()->create();
    $project = Project::factory()->create(['user_id' => $user->id]);
    $foreignKit = BrandKit::factory()->create();

    $this->actingAs($user)
        ->put(route('editor.projects.update', $project), ['brand_kit_id' => $foreignKit->id])
        ->assertSessionHasErrors('brand_kit_id');

    expect($project->fresh()->brand_kit_id)->toBeNull();
});

test('deleting a brand kit detaches it from projects instead of deleting them', function () {
    $user = User::factory()->create();
    $kit = BrandKit::factory()->for($user)->create();
    $project = Project::factory()->create(['user_id' => $user->id, 'brand_kit_id' => $kit->id]);

    $kit->delete();

    expect($project->fresh())->not->toBeNull()
        ->and($project->fresh()->brand_kit_id)->toBeNull();
});

test('the editor page ships the project brand kit and the user\'s kit list', function () {
    $user = User::factory()->create();
    $kit = BrandKit::factory()->for($user)->create();
    $project = Project::factory()->create(['user_id' => $user->id, 'brand_kit_id' => $kit->id]);

    $this->actingAs($user)
        ->get(route('editor.projects.show', $project))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('editor/Show')
            ->where('project.brand_kit_id', $kit->id)
            ->where('project.brand_kit.id', $kit->id)
            ->where('project.brand_kit.fonts.display', 'Montserrat, sans-serif')
            ->has('brandKits', 1));
});

test('the headless render payload includes the brand kit so the page can resolve tokens', function () {
    $user = User::factory()->create();
    $kit = BrandKit::factory()->for($user)->create();
    $project = Project::factory()->create(['user_id' => $user->id, 'brand_kit_id' => $kit->id]);

    $payload = HeadlessRenderPayload::forProject($project->fresh(), 'test-token');

    expect($payload['project']['brand_kit']['id'])->toBe($kit->id)
        ->and($payload['project']['brand_kit']['colors']['primary'])->toBe('#ff3366');

    $bare = Project::factory()->create(['user_id' => $user->id]);

    expect(HeadlessRenderPayload::forProject($bare->fresh(), 'test-token')['project']['brand_kit'])->toBeNull();
});
