<?php

namespace App\Http\Controllers\Editor;

use App\Enums\GenerationStatus;
use App\Enums\GenerationType;
use App\Http\Controllers\Controller;
use App\Jobs\RunGeneration;
use App\Models\Generation;
use App\Models\Project;
use App\Services\FalAI\FalClient;
use App\Services\FalAI\ModelRegistry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class GenerationController extends Controller
{
    public function __construct(
        protected ModelRegistry $modelRegistry,
        protected FalClient $falClient
    ) {}

    /**
     * Get available models for each generation type with full metadata.
     */
    public function models(): JsonResponse
    {
        $models = $this->modelRegistry->getAllModels();

        return response()->json(['models' => $models]);
    }

    /**
     * Force refresh the models cache.
     */
    public function refreshModels(): JsonResponse
    {
        $this->modelRegistry->refresh();

        return response()->json(['message' => 'Models cache refreshed']);
    }

    /**
     * Search the fal.ai model catalog.
     */
    public function searchCatalog(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'category' => ['nullable', 'string', 'in:text-to-image,image-to-video,text-to-audio,text-to-speech'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:50'],
            'cursor' => ['nullable', 'string'],
        ]);

        $result = $this->falClient->searchModels($validated);

        // Transform the response to a consistent format
        $models = array_map(function ($model) {
            $metadata = $model['metadata'] ?? [];

            return [
                'endpoint_id' => $model['endpoint_id'],
                'name' => $metadata['display_name'] ?? $model['endpoint_id'],
                'description' => $metadata['description'] ?? '',
                'category' => $metadata['category'] ?? 'unknown',
                'thumbnail' => $metadata['thumbnail_url'] ?? null,
                'tags' => $metadata['tags'] ?? [],
                'is_highlighted' => $metadata['highlighted'] ?? false,
                'model_url' => $metadata['model_url'] ?? "https://fal.ai/models/{$model['endpoint_id']}",
            ];
        }, $result['models'] ?? []);

        return response()->json([
            'models' => $models,
            'next_cursor' => $result['next_cursor'] ?? null,
            'has_more' => $result['has_more'] ?? false,
        ]);
    }

    /**
     * Get a single model with its parameters schema.
     */
    public function getCatalogModel(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'endpoint_id' => ['required', 'string'],
        ]);

        $model = $this->falClient->getModel($validated['endpoint_id']);

        if (! $model) {
            return response()->json(['error' => 'Model not found'], 404);
        }

        $metadata = $model['metadata'] ?? [];
        $openapi = $model['openapi'] ?? null;

        // Parse OpenAPI schema to extract input parameters
        $parameters = [];
        $defaults = [];

        if ($openapi) {
            $inputSchema = $this->extractInputSchema($openapi);
            if ($inputSchema) {
                [$parameters, $defaults] = $this->parseSchemaToParameters($inputSchema);
            }
        }

        return response()->json([
            'model' => [
                'key' => $validated['endpoint_id'],
                'id' => $validated['endpoint_id'],
                'name' => $metadata['display_name'] ?? $validated['endpoint_id'],
                'description' => $metadata['description'] ?? '',
                'thumbnail' => $metadata['thumbnail_url'] ?? null,
                'playground_url' => "https://fal.ai/models/{$validated['endpoint_id']}",
                'category' => $metadata['category'] ?? 'unknown',
                'tags' => $metadata['tags'] ?? [],
                'is_featured' => false,
                'is_new' => false,
                'is_catalog' => true,
                'parameters' => $parameters,
                'defaults' => $defaults,
            ],
        ]);
    }

    /**
     * Extract input schema from OpenAPI spec.
     *
     * @param  array<string, mixed>  $openapi
     * @return array<string, mixed>|null
     */
    protected function extractInputSchema(array $openapi): ?array
    {
        // Look for the POST endpoint input schema
        $paths = $openapi['paths'] ?? [];
        foreach ($paths as $path => $methods) {
            if (isset($methods['post']['requestBody']['content']['application/json']['schema'])) {
                $schema = $methods['post']['requestBody']['content']['application/json']['schema'];

                return $this->resolveSchemaRef($schema, $openapi);
            }
        }

        // Try components/schemas/Input
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
        // If schema has $ref, resolve it
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
        $required = $schema['required'] ?? [];

        // Common parameters we want to show prominently
        $commonKeys = ['prompt', 'image_url', 'image_size', 'aspect_ratio', 'num_images', 'duration', 'voice', 'style'];
        // Parameters to skip (handled separately or internal)
        $skipKeys = ['prompt', 'image_url', 'video_url', 'audio_url', 'sync_mode', 'webhooks'];

        foreach ($properties as $key => $prop) {
            if (in_array($key, $skipKeys)) {
                continue;
            }

            $type = $prop['type'] ?? 'string';
            $paramConfig = [
                'label' => $this->formatLabel($key),
                'group' => in_array($key, $commonKeys) ? 'common' : 'advanced',
            ];

            // Determine parameter type
            if (isset($prop['enum'])) {
                $paramConfig['type'] = 'select';
                $paramConfig['options'] = array_combine($prop['enum'], array_map(fn ($v) => $this->formatLabel((string) $v), $prop['enum']));
            } elseif (isset($prop['anyOf'])) {
                // Handle anyOf - find the enum option if present
                foreach ($prop['anyOf'] as $option) {
                    if (isset($option['enum'])) {
                        $paramConfig['type'] = 'select';
                        $paramConfig['options'] = array_combine($option['enum'], array_map(fn ($v) => $this->formatLabel((string) $v), $option['enum']));
                        break;
                    }
                }
                // If no enum found in anyOf, default to text
                if (! isset($paramConfig['type'])) {
                    $paramConfig['type'] = 'text';
                }
            } elseif ($type === 'boolean') {
                $paramConfig['type'] = 'checkbox';
            } elseif ($type === 'integer' || $type === 'number') {
                $paramConfig['type'] = 'slider';
                $paramConfig['min'] = $prop['minimum'] ?? 0;
                $paramConfig['max'] = $prop['maximum'] ?? ($type === 'integer' ? 100 : 10);
                $paramConfig['step'] = $type === 'integer' ? 1 : 0.1;
            } elseif ($type === 'string' && ($prop['maxLength'] ?? 0) > 200) {
                $paramConfig['type'] = 'textarea';
            } else {
                $paramConfig['type'] = 'text';
            }

            $parameters[$key] = $paramConfig;

            // Set default value
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

    /**
     * Start a new generation.
     */
    public function store(Request $request, Project $project, string $type): JsonResponse
    {
        $this->authorize('update', $project);

        $generationType = GenerationType::from($type);

        $validated = $request->validate([
            'prompt' => ['required', 'string', 'max:2000'],
            'scene_id' => ['nullable', 'string', 'uuid'],
            'step_index' => ['nullable', 'integer', 'min:0'],
            'input_asset_id' => ['nullable', 'exists:assets,id'],
            'model_key' => ['nullable', 'string'],
            'model_id' => ['nullable', 'string'], // Direct fal.ai endpoint ID for catalog models
            'parameters' => ['nullable', 'array'],
        ]);

        // Resolve the model - either from registry or as a catalog model
        $modelKey = $validated['model_key'] ?? null;
        $modelId = $validated['model_id'] ?? null;
        $modelConfig = null;

        // First, try to find in our pre-configured models
        if ($modelKey) {
            $models = $this->modelRegistry->getAllModels()[$generationType->value] ?? [];
            foreach ($models as $model) {
                if ($model['key'] === $modelKey) {
                    $modelConfig = $model;
                    break;
                }
            }
        }

        // If not found and we have a direct model_id, use it as a catalog model
        if (! $modelConfig && $modelId) {
            $modelConfig = [
                'key' => $modelId,
                'id' => $modelId,
                'defaults' => [],
            ];
        }

        // Fall back to first model from registry if nothing specified
        if (! $modelConfig) {
            $models = $this->modelRegistry->getAllModels()[$generationType->value] ?? [];
            if (! empty($models)) {
                $modelConfig = $models[0];
            }
        }

        if (! $modelConfig) {
            return response()->json(['error' => 'No models available for this type'], 422);
        }

        // Merge default parameters with user-provided parameters
        $parameters = array_merge(
            $modelConfig['defaults'] ?? [],
            $validated['parameters'] ?? [],
            ['model_key' => $modelConfig['key']]
        );

        $generation = Generation::create([
            'user_id' => $request->user()->id,
            'project_id' => $project->id,
            'scene_id' => $validated['scene_id'] ?? null,
            'step_index' => $validated['step_index'] ?? null,
            'type' => $generationType,
            'provider' => 'fal',
            'model' => $modelConfig['id'],
            'prompt' => $validated['prompt'],
            'input_asset_id' => $validated['input_asset_id'] ?? null,
            'parameters' => $parameters,
            'status' => GenerationStatus::Pending,
        ]);

        RunGeneration::dispatch($generation);

        return response()->json([
            'generation' => $generation,
        ], 201);
    }

    /**
     * Get the status of a generation.
     */
    public function show(Request $request, Generation $generation): JsonResponse
    {
        $this->authorize('view', $generation);

        $generation->load(['outputAsset']);

        return response()->json([
            'generation' => $generation,
        ]);
    }
}
