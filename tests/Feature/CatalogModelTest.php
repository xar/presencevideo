<?php

use App\Models\User;
use Illuminate\Support\Facades\Http;

/**
 * The fal.ai catalog returns some endpoint ids without an owner prefix
 * (e.g. "minimax/h3-max/image-to-video" rather than "fal-ai/..."). These must
 * resolve just like prefixed ones, otherwise the editor's model picker silently
 * fails to select them.
 */
test('catalog model endpoint resolves an unprefixed endpoint id', function () {
    Http::fake([
        'api.fal.ai/v1/models*' => Http::response([
            'models' => [
                [
                    'endpoint_id' => 'minimax/h3-max/image-to-video',
                    'metadata' => [
                        'display_name' => 'H3 Max Image to Video',
                        'description' => 'A post-trained variant of MiniMax H3.',
                        'category' => 'image-to-video',
                        'thumbnail_url' => 'https://example.test/thumb.jpg',
                        'tags' => ['image-to-video'],
                    ],
                    'openapi' => [
                        'paths' => [
                            '/' => [
                                'post' => [
                                    'requestBody' => [
                                        'content' => [
                                            'application/json' => [
                                                'schema' => [
                                                    'type' => 'object',
                                                    'properties' => [
                                                        'prompt' => ['type' => 'string'],
                                                        'duration' => ['type' => 'integer', 'default' => 6],
                                                    ],
                                                ],
                                            ],
                                        ],
                                    ],
                                ],
                            ],
                        ],
                    ],
                ],
            ],
        ]),
    ]);

    $response = $this->actingAs(User::factory()->create())
        ->getJson('/editor/generations/catalog/model?endpoint_id=minimax/h3-max/image-to-video');

    $response->assertOk()
        ->assertJsonPath('model.key', 'minimax/h3-max/image-to-video')
        ->assertJsonPath('model.id', 'minimax/h3-max/image-to-video')
        ->assertJsonPath('model.name', 'H3 Max Image to Video')
        // The picker only lists a catalog model when its category maps to the
        // step's generation type, so this value is load-bearing.
        ->assertJsonPath('model.category', 'image-to-video')
        ->assertJsonPath('model.is_catalog', true);

    expect($response->json('model.parameters'))->toHaveKey('duration')
        ->and($response->json('model.defaults.duration'))->toBe(6);
});

test('catalog model endpoint returns 404 when the model is unknown', function () {
    Http::fake([
        'api.fal.ai/v1/models*' => Http::response(['models' => []]),
    ]);

    $this->actingAs(User::factory()->create())
        ->getJson('/editor/generations/catalog/model?endpoint_id=does/not/exist')
        ->assertNotFound();
});

test('catalog model endpoint requires an endpoint id', function () {
    $this->actingAs(User::factory()->create())
        ->getJson('/editor/generations/catalog/model')
        ->assertStatus(422);
});

test('guests cannot query the catalog', function () {
    $this->getJson('/editor/generations/catalog/model?endpoint_id=minimax/h3-max/image-to-video')
        ->assertUnauthorized();
});
