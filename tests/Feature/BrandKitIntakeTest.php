<?php

use App\Jobs\ProcessAssetUpload;
use App\Models\Asset;
use App\Models\BrandKit;
use App\Models\User;
use App\Services\BrandKit\IntakeAssetImporter;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;

/**
 * The importer resolves every host before fetching it, which would put real DNS
 * in the middle of these tests. Only the lookup is stubbed: the guard that
 * decides what an address is allowed to be still runs, and the tests that pass
 * a literal address exercise the real resolver.
 */
function fakeDns(): void
{
    app()->instance(IntakeAssetImporter::class, new class extends IntakeAssetImporter
    {
        protected function resolve(string $host): array
        {
            return match ($host) {
                'cdn.example.com' => ['93.184.216.34'],
                'metadata.internal' => ['169.254.169.254'],
                default => parent::resolve($host),
            };
        }
    });
}

test('minting an intake link creates a draft kit named after the site and returns the prompt', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)
        ->postJson(route('editor.brand-kits.intake-link'), ['website_url' => 'https://www.acme-tools.com/about'])
        ->assertOk();

    $kit = BrandKit::query()->where('user_id', $user->id)->firstOrFail();

    expect($kit->name)->toBe('Acme Tools')
        ->and($kit->website_url)->toBe('https://www.acme-tools.com/about')
        ->and($kit->intake_token)->not->toBeNull()
        ->and($kit->intake_token_expires_at)->toBeGreaterThan(now());

    $response->assertJsonPath('brand_kit_id', $kit->id);

    expect($response->json('intake_url'))->toContain($kit->intake_token)
        ->and($response->json('prompt'))->toContain($response->json('intake_url'))
        ->and($response->json('prompt'))->toContain('https://www.acme-tools.com/about')
        ->and($response->json('prompt'))->toContain('caption_highlight');
});

test('minting for an existing kit replaces its previous token', function () {
    $user = User::factory()->create();
    $kit = BrandKit::factory()->for($user)->create();
    $first = $kit->issueIntakeToken();

    $this->actingAs($user)
        ->postJson(route('editor.brand-kits.intake-link'), ['brand_kit_id' => $kit->id])
        ->assertOk();

    expect($kit->fresh()->intake_token)->not->toBe($first);

    $this->getJson(route('brand-intake.show', ['token' => $first]))->assertNotFound();
});

test('a user cannot mint an intake link for another user\'s kit', function () {
    $foreignKit = BrandKit::factory()->create();

    $this->actingAs(User::factory()->create())
        ->postJson(route('editor.brand-kits.intake-link'), ['brand_kit_id' => $foreignKit->id])
        ->assertStatus(422);
});

test('the intake token never rides along on an ordinary brand kit payload', function () {
    $user = User::factory()->create();
    $kit = BrandKit::factory()->for($user)->create();
    $kit->issueIntakeToken();

    $this->actingAs($user)
        ->get(route('editor.brand-kits.index'))
        ->assertInertia(fn ($page) => $page->missing('brandKits.0.intake_token'));
});

test('an intake token reads the kit and its field contract without a session', function () {
    $kit = BrandKit::factory()->create();
    $token = $kit->issueIntakeToken();

    $this->getJson(route('brand-intake.show', ['token' => $token]))
        ->assertOk()
        ->assertJsonPath('brand_kit.id', $kit->id)
        ->assertJsonPath('contract.color_roles', BrandKit::COLOR_ROLES)
        ->assertJsonPath('contract.asset_roles.0', 'logo_full');
});

test('an unknown or expired intake token is a json 404', function () {
    $kit = BrandKit::factory()->create();
    $token = $kit->issueIntakeToken();

    $this->getJson(route('brand-intake.show', ['token' => 'nope']))->assertNotFound();

    $kit->forceFill(['intake_token_expires_at' => now()->subMinute()])->save();

    $this->getJson(route('brand-intake.show', ['token' => $token]))
        ->assertNotFound()
        ->assertJsonStructure(['message']);
});

test('an intake patch merges role maps instead of replacing them', function () {
    $kit = BrandKit::factory()->create(['colors' => ['primary' => '#111111', 'text' => '#ffffff']]);
    $token = $kit->issueIntakeToken();

    $this->patchJson(route('brand-intake.update', ['token' => $token]), [
        'name' => 'Acme',
        'colors' => ['primary' => '#ff0000', 'accent' => '#00ff00'],
        'fonts' => ['display' => 'Bebas Neue, sans-serif'],
        'tone' => 'Short and punchy.',
    ])->assertOk();

    expect($kit->fresh()->colors)->toBe(['primary' => '#ff0000', 'text' => '#ffffff', 'accent' => '#00ff00'])
        ->and($kit->fresh()->name)->toBe('Acme')
        ->and($kit->fresh()->tone)->toBe('Short and punchy.');
});

test('an intake patch is validated by the same rules as the editor and writes nothing when it fails', function () {
    $kit = BrandKit::factory()->create(['colors' => ['primary' => '#111111']]);
    $foreignAsset = Asset::factory()->create();
    $token = $kit->issueIntakeToken();

    $this->patchJson(route('brand-intake.update', ['token' => $token]), [
        'colors' => ['primary' => 'not-a-colour'],
        'logos' => ['mark' => $foreignAsset->id],
    ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['colors.primary', 'logos.mark']);

    expect($kit->fresh()->colors)->toBe(['primary' => '#111111']);
});

test('an intake upload fetches a public url, stores it for the kit owner and attaches the slot', function () {
    Queue::fake();
    fakeDns();
    Http::fake(['cdn.example.com/*' => Http::response('PNGDATA', 200, ['Content-Type' => 'image/png'])]);

    $kit = BrandKit::factory()->create();
    $token = $kit->issueIntakeToken();

    $response = $this->postJson(route('brand-intake.assets.store', ['token' => $token]), [
        'source_url' => 'https://cdn.example.com/logo.png',
        'name' => 'Wordmark',
        'role' => 'logo_full',
    ])->assertCreated();

    $asset = Asset::findOrFail($response->json('asset.id'));

    expect($asset->user_id)->toBe($kit->user_id)
        ->and($asset->project_id)->toBeNull()
        ->and($asset->name)->toBe('Wordmark')
        ->and($kit->fresh()->logos['full'])->toBe($asset->id);

    Queue::assertPushed(ProcessAssetUpload::class);
});

test('an intake upload attached as a watermark fills the placement defaults', function () {
    Queue::fake();
    fakeDns();
    Http::fake(['cdn.example.com/*' => Http::response('PNGDATA', 200, ['Content-Type' => 'image/png'])]);

    $kit = BrandKit::factory()->create(['watermark' => null]);
    $token = $kit->issueIntakeToken();

    $response = $this->postJson(route('brand-intake.assets.store', ['token' => $token]), [
        'source_url' => 'https://cdn.example.com/mark.png',
        'role' => 'watermark',
    ])->assertCreated();

    expect($kit->fresh()->watermark)->toBe([
        'position' => 'bottom-right',
        'opacity' => 0.6,
        'size' => 0.12,
        'asset_id' => $response->json('asset.id'),
    ]);
});

test('an intake upload refuses a private host and never issues the request', function () {
    Http::fake();

    $kit = BrandKit::factory()->create();
    $token = $kit->issueIntakeToken();

    $this->postJson(route('brand-intake.assets.store', ['token' => $token]), [
        'source_url' => 'http://127.0.0.1/logo.png',
    ])->assertStatus(422);

    Http::assertNothingSent();

    expect(Asset::query()->count())->toBe(0);
});

test('an intake upload refuses a non-media response', function () {
    fakeDns();
    Http::fake(['cdn.example.com/*' => Http::response('<html></html>', 200, ['Content-Type' => 'text/html'])]);

    $kit = BrandKit::factory()->create();
    $token = $kit->issueIntakeToken();

    $this->postJson(route('brand-intake.assets.store', ['token' => $token]), [
        'source_url' => 'https://cdn.example.com/not-a-logo',
    ])->assertStatus(422);

    expect(Asset::query()->count())->toBe(0);
});

test('an intake upload refuses a file over the size limit', function () {
    config(['brand_intake.max_asset_bytes' => 10]);
    fakeDns();
    Http::fake(['cdn.example.com/*' => Http::response(str_repeat('x', 64), 200, ['Content-Type' => 'image/png'])]);

    $kit = BrandKit::factory()->create();
    $token = $kit->issueIntakeToken();

    $this->postJson(route('brand-intake.assets.store', ['token' => $token]), [
        'source_url' => 'https://cdn.example.com/huge.png',
    ])->assertStatus(422);

    expect(Asset::query()->count())->toBe(0);
});

test('an intake token can only ever reach its own kit', function () {
    $mine = BrandKit::factory()->create(['name' => 'Mine']);
    $theirs = BrandKit::factory()->create(['name' => 'Theirs']);
    $token = $mine->issueIntakeToken();

    $this->patchJson(route('brand-intake.update', ['token' => $token]), ['name' => 'Rewritten'])->assertOk();

    expect($mine->fresh()->name)->toBe('Rewritten')
        ->and($theirs->fresh()->name)->toBe('Theirs');
});

test('the owner can revoke an intake link', function () {
    $user = User::factory()->create();
    $kit = BrandKit::factory()->for($user)->create();
    $token = $kit->issueIntakeToken();

    $this->actingAs($user)
        ->deleteJson(route('editor.brand-kits.intake-link.revoke', $kit))
        ->assertNoContent();

    $this->getJson(route('brand-intake.show', ['token' => $token]))->assertNotFound();
});

/*
 * A redirect is the way past a check that only looks at the URL the caller
 * typed, so the fetch re-runs the same guard on every hop (`on_redirect`).
 * `Http::fake()` answers before Guzzle's redirect middleware ever runs, so the
 * guard itself is what gets asserted here rather than a faked round trip.
 */
test('the url guard rejects every address a redirect could be aimed at', function (string $url) {
    $guard = new class extends IntakeAssetImporter
    {
        public function check(string $url): void
        {
            $this->assertPublicUrl($url);
        }

        protected function resolve(string $host): array
        {
            return $host === 'metadata.internal' ? ['169.254.169.254'] : parent::resolve($host);
        }
    };

    expect(fn () => $guard->check($url))->toThrow(RuntimeException::class);
})->with([
    'link-local metadata by name' => ['http://metadata.internal/latest/meta-data'],
    'link-local metadata by address' => ['http://169.254.169.254/latest/meta-data'],
    'loopback' => ['http://127.0.0.1/logo.png'],
    'private range' => ['http://10.0.0.5/logo.png'],
    'ipv6 loopback' => ['http://[::1]/logo.png'],
    'a non-http scheme' => ['file:///etc/passwd'],
]);

test('the url guard allows an ordinary public address', function () {
    $guard = new class extends IntakeAssetImporter
    {
        public function check(string $url): void
        {
            $this->assertPublicUrl($url);
        }

        protected function resolve(string $host): array
        {
            return ['93.184.216.34'];
        }
    };

    expect(fn () => $guard->check('https://cdn.example.com/logo.png'))->not->toThrow(RuntimeException::class);
});
