<?php

namespace App\Services\FalAI;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ModelRegistry
{
    protected string $platformUrl = 'https://api.fal.ai';

    public function __construct(
        protected ?string $apiKey = null
    ) {
        $this->apiKey = $apiKey ?? config('services.fal.key');
    }

    /**
     * Get all models for our supported generation types with full metadata.
     *
     * @return array<string, array<int, array{
     *     key: string,
     *     id: string,
     *     name: string,
     *     description: string,
     *     thumbnail: string|null,
     *     playground_url: string,
     *     category: string,
     *     tags: array<string>,
     *     pricing: array{base_price: float|null, price_per_unit: float|null, unit: string|null}|null,
     *     parameters: array<string, mixed>,
     *     defaults: array<string, mixed>,
     *     is_featured: bool,
     *     is_new: bool,
     * }>>
     */
    public function getAllModels(): array
    {
        $models = Cache::get('fal_models_registry_remote');

        if (! $models || $this->hasEmptyCategories($models)) {
            $models = [
                'text_to_image' => $this->fetchRemoteModels('text-to-image'),
                'image_to_video' => $this->fetchRemoteModels('image-to-video'),
                'text_to_music' => $this->fetchRemoteModels('text-to-audio', ['music', 'song']),
                'text_to_speech' => $this->fetchRemoteModels('text-to-speech'),
                'text_to_sfx' => $this->fetchRemoteModels('text-to-audio', ['effect', 'sfx', 'foley', 'ambient', 'environment']),
            ];

            // If API failed, use fallback defaults to ensure the app doesn't break
            if ($this->hasEmptyCategories($models)) {
                $models = $this->getFallbackModels();
            } else {
                // Only cache if we successfully got models for at least the primary categories
                Cache::put('fal_models_registry_remote', $models, 3600);
            }
        }

        return $models;
    }

    protected function hasEmptyCategories(array $models): bool
    {
        return empty($models['text_to_image']) || empty($models['image_to_video']);
    }

    protected function getFallbackModels(): array
    {
        return [
            'text_to_image' => [
                [
                    'key' => 'fal-ai/flux/dev',
                    'id' => 'fal-ai/flux/dev',
                    'name' => 'FLUX.1 Dev',
                    'description' => '12B parameter flow transformer. High-quality, versatile image generation.',
                    'thumbnail' => null,
                    'playground_url' => 'https://fal.ai/models/fal-ai/flux/dev',
                    'category' => 'text-to-image',
                    'tags' => ['flux'],
                    'pricing' => null,
                    'parameters' => [
                        'image_size' => [
                            'label' => 'Image Size',
                            'group' => 'common',
                            'type' => 'select',
                            'options' => [
                                'square_hd' => 'Square HD',
                                'portrait_4_3' => 'Portrait 4:3',
                                'portrait_16_9' => 'Portrait 16:9',
                                'landscape_4_3' => 'Landscape 4:3',
                                'landscape_16_9' => 'Landscape 16:9',
                            ],
                        ],
                        'num_inference_steps' => ['label' => 'Inference Steps', 'group' => 'advanced', 'type' => 'slider', 'min' => 10, 'max' => 50, 'step' => 1],
                    ],
                    'defaults' => ['image_size' => 'portrait_16_9', 'num_inference_steps' => 28],
                    'is_featured' => true,
                    'is_new' => false,
                    'is_catalog' => true,
                ],
            ],
            'image_to_video' => [
                [
                    'key' => 'fal-ai/minimax-video/image-to-video',
                    'id' => 'fal-ai/minimax-video/image-to-video',
                    'name' => 'MiniMax Video',
                    'description' => 'High-quality video generation with natural motion.',
                    'thumbnail' => null,
                    'playground_url' => 'https://fal.ai/models/fal-ai/minimax-video/image-to-video',
                    'category' => 'image-to-video',
                    'tags' => ['video'],
                    'pricing' => null,
                    'parameters' => [
                        'prompt_optimizer' => ['label' => 'Optimize Prompt', 'group' => 'common', 'type' => 'checkbox'],
                    ],
                    'defaults' => ['prompt_optimizer' => true],
                    'is_featured' => true,
                    'is_new' => false,
                    'is_catalog' => true,
                ],
            ],
            'text_to_music' => [],
            'text_to_speech' => [],
            'text_to_sfx' => [],
        ];
    }

    /**
     * Force refresh the model cache.
     */
    public function refresh(): void
    {
        Cache::forget('fal_models_registry_remote');
        $this->getAllModels();
    }

    /**
     * Fetch top models for a specific fal.ai category.
     *
     * @param  array<string>  $tagFilters  Optional keyword filters for name/description/tags
     * @return array<int, array<string, mixed>>
     */
    protected function fetchRemoteModels(string $category, array $tagFilters = []): array
    {
        try {
            // Check if API key is configured
            if (empty($this->apiKey)) {
                Log::error('Fal.ai API key not configured. Set FAL_KEY in your .env file.');

                return [];
            }

            // We fetch up to 10 models since that is the limit with expand=openapi-3.0
            $response = Http::withHeaders([
                'Authorization' => 'Key '.$this->apiKey,
                'Accept' => 'application/json',
            ])->timeout(30)->get("{$this->platformUrl}/v1/models", [
                'status' => 'active',
                'category' => $category,
                'limit' => 10,
                'expand' => 'openapi-3.0',
            ]);

            if (! $response->successful()) {
                Log::warning("Fal.ai model fetch failed for category {$category}", [
                    'status' => $response->status(),
                    'error' => $response->json('error', 'Unknown error'),
                    'body' => $response->body(),
                ]);

                return [];
            }

            $models = $response->json()['models'] ?? [];
            $formattedModels = [];

            foreach ($models as $model) {
                $metadata = $model['metadata'] ?? [];

                // If we have filters, check if the model matches
                if (! empty($tagFilters)) {
                    $searchString = strtolower(
                        ($metadata['display_name'] ?? '').' '.
                        ($metadata['description'] ?? '').' '.
                        implode(' ', $metadata['tags'] ?? [])
                    );

                    $matched = false;
                    foreach ($tagFilters as $filter) {
                        if (str_contains($searchString, strtolower($filter))) {
                            $matched = true;
                            break;
                        }
                    }

                    if (! $matched) {
                        continue;
                    }
                }

                $openapi = $model['openapi'] ?? null;
                $parameters = [];
                $defaults = [];

                if ($openapi) {
                    $inputSchema = $this->extractInputSchema($openapi);
                    if ($inputSchema) {
                        [$parameters, $defaults] = $this->parseSchemaToParameters($inputSchema);
                    }
                }

                $formattedModels[] = [
                    'key' => $model['endpoint_id'],
                    'id' => $model['endpoint_id'],
                    'name' => $metadata['display_name'] ?? $model['endpoint_id'],
                    'description' => $metadata['description'] ?? '',
                    'thumbnail' => $metadata['thumbnail_url'] ?? null,
                    'playground_url' => $metadata['model_url'] ?? "https://fal.ai/models/{$model['endpoint_id']}",
                    'category' => $metadata['category'] ?? 'unknown',
                    'tags' => $metadata['tags'] ?? [],
                    'pricing' => null,
                    'parameters' => $parameters,
                    'defaults' => $defaults,
                    'is_featured' => $metadata['highlighted'] ?? false,
                    'is_new' => false,
                    'is_catalog' => true,
                ];
            }

            return $formattedModels;
        } catch (\Exception $e) {
            Log::error("Failed to fetch fal.ai models for category {$category}: ".$e->getMessage());

            return [];
        }
    }

    /**
     * Extract input schema from OpenAPI spec.
     *
     * @param  array<string, mixed>  $openapi
     * @return array<string, mixed>|null
     */
    protected function extractInputSchema(array $openapi): ?array
    {
        $paths = $openapi['paths'] ?? [];
        foreach ($paths as $path => $methods) {
            if (isset($methods['post']['requestBody']['content']['application/json']['schema'])) {
                $schema = $methods['post']['requestBody']['content']['application/json']['schema'];

                return $this->resolveSchemaRef($schema, $openapi);
            }
        }

        if (isset($openapi['components']['schemas']['Input'])) {
            return $this->resolveSchemaRef($openapi['components']['schemas']['Input'], $openapi);
        }

        return null;
    }

    /**
     * Resolve $ref in OpenAPI schema.
     *
     * @param  array<string, mixed>  $schema
     * @param  array<string, mixed>  $openapi
     * @return array<string, mixed>
     */
    protected function resolveSchemaRef(array $schema, array $openapi): array
    {
        if (isset($schema['$ref'])) {
            $ref = $schema['$ref'];
            if (str_starts_with($ref, '#/components/schemas/')) {
                $schemaName = substr($ref, strlen('#/components/schemas/'));

                return $openapi['components']['schemas'][$schemaName] ?? $schema;
            }
        }

        return $schema;
    }

    /**
     * Parse OpenAPI schema into our parameter format.
     *
     * @param  array<string, mixed>  $schema
     * @return array{0: array<string, array<string, mixed>>, 1: array<string, mixed>}
     */
    protected function parseSchemaToParameters(array $schema): array
    {
        $parameters = [];
        $defaults = [];
        $properties = $schema['properties'] ?? [];

        // Common parameters we want to show prominently
        $commonKeys = ['prompt', 'image_url', 'image_size', 'aspect_ratio', 'num_images', 'duration', 'voice', 'style'];
        // Parameters to skip (handled separately or internal)
        $skipKeys = ['prompt', 'image_url', 'video_url', 'audio_url', 'sync_mode', 'webhooks', 'seed'];

        foreach ($properties as $key => $prop) {
            if (in_array($key, $skipKeys)) {
                continue;
            }

            $type = $prop['type'] ?? 'string';
            $paramConfig = [
                'label' => $this->formatLabel($key),
                'group' => in_array($key, $commonKeys) ? 'common' : 'advanced',
            ];

            if (isset($prop['enum'])) {
                $paramConfig['type'] = 'select';
                $paramConfig['options'] = array_combine($prop['enum'], array_map(fn ($v) => $this->formatLabel((string) $v), $prop['enum']));
            } elseif (isset($prop['anyOf'])) {
                foreach ($prop['anyOf'] as $option) {
                    if (isset($option['enum'])) {
                        $paramConfig['type'] = 'select';
                        $paramConfig['options'] = array_combine($option['enum'], array_map(fn ($v) => $this->formatLabel((string) $v), $option['enum']));
                        break;
                    }
                }
                if (! isset($paramConfig['type'])) {
                    $paramConfig['type'] = 'text';
                }
            } elseif ($type === 'boolean') {
                $paramConfig['type'] = 'checkbox';
            } elseif ($type === 'integer' || $type === 'number') {
                if (isset($prop['minimum']) && isset($prop['maximum'])) {
                    $paramConfig['type'] = 'slider';
                    $paramConfig['min'] = $prop['minimum'];
                    $paramConfig['max'] = $prop['maximum'];
                    $paramConfig['step'] = $type === 'integer' ? 1 : 0.1;
                } else {
                    $paramConfig['type'] = 'number';
                    if (isset($prop['minimum'])) {
                        $paramConfig['min'] = $prop['minimum'];
                    }
                    if (isset($prop['maximum'])) {
                        $paramConfig['max'] = $prop['maximum'];
                    }
                    $paramConfig['step'] = $type === 'integer' ? 1 : 'any';
                }
            } elseif ($type === 'string' && ($prop['maxLength'] ?? 0) > 200) {
                $paramConfig['type'] = 'textarea';
            } else {
                $paramConfig['type'] = 'text';
            }

            $parameters[$key] = $paramConfig;

            if (isset($prop['default'])) {
                $defaults[$key] = $prop['default'];
            }
        }

        return [$parameters, $defaults];
    }

    /**
     * Format a snake_case key into a readable label.
     */
    protected function formatLabel(string $key): string
    {
        return ucfirst(str_replace(['_', '-'], ' ', $key));
    }
}
