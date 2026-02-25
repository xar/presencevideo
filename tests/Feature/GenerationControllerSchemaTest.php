<?php

use App\Http\Controllers\Editor\GenerationController;

test('resolves $ref in OpenAPI schema', function () {
    $controller = app()->make(GenerationController::class);

    $openapi = [
        'paths' => [
            '/' => [
                'post' => [
                    'requestBody' => [
                        'content' => [
                            'application/json' => [
                                'schema' => [
                                    '$ref' => '#/components/schemas/RecraftV3Input',
                                ],
                            ],
                        ],
                    ],
                ],
            ],
        ],
        'components' => [
            'schemas' => [
                'RecraftV3Input' => [
                    'type' => 'object',
                    'properties' => [
                        'style' => [
                            'type' => 'string',
                            'enum' => ['realistic_image', 'digital_illustration', 'vector_illustration'],
                        ],
                        'prompt' => [
                            'type' => 'string',
                        ],
                    ],
                ],
            ],
        ],
    ];

    $reflection = new ReflectionMethod($controller, 'extractInputSchema');

    $result = $reflection->invoke($controller, $openapi);

    expect($result)->toHaveKey('properties')
        ->and($result['properties'])->toHaveKey('style')
        ->and($result['properties']['style']['enum'])->toContain('realistic_image');
});

test('handles anyOf with enum in property', function () {
    $controller = app()->make(GenerationController::class);

    $schema = [
        'type' => 'object',
        'properties' => [
            'image_size' => [
                'anyOf' => [
                    ['$ref' => '#/components/schemas/ImageSize'],
                    ['enum' => ['square_hd', 'square', 'portrait_4_3', 'portrait_16_9'], 'type' => 'string'],
                ],
            ],
        ],
    ];

    $reflection = new ReflectionMethod($controller, 'parseSchemaToParameters');

    [$parameters, $defaults] = $reflection->invoke($controller, $schema);

    expect($parameters)->toHaveKey('image_size')
        ->and($parameters['image_size']['type'])->toBe('select')
        ->and($parameters['image_size']['options'])->toHaveKey('square_hd');
});

test('extracts enum properties as select parameters', function () {
    $controller = app()->make(GenerationController::class);

    $schema = [
        'type' => 'object',
        'properties' => [
            'style' => [
                'type' => 'string',
                'enum' => ['realistic_image', 'digital_illustration/pixel_art', 'vector_illustration/line_art'],
                'default' => 'realistic_image',
            ],
        ],
    ];

    $reflection = new ReflectionMethod($controller, 'parseSchemaToParameters');

    [$parameters, $defaults] = $reflection->invoke($controller, $schema);

    expect($parameters)->toHaveKey('style')
        ->and($parameters['style']['type'])->toBe('select')
        ->and($parameters['style']['options'])->toHaveKey('realistic_image')
        ->and($parameters['style']['options'])->toHaveKey('digital_illustration/pixel_art')
        ->and($defaults)->toHaveKey('style')
        ->and($defaults['style'])->toBe('realistic_image');
});
