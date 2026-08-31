<?php

namespace App\Services;

use App\Enums\AssetSource;
use App\Enums\AssetType;
use App\Enums\GenerationType;
use App\Models\Asset;
use App\Models\Generation;
use App\Services\FalAI\FalClient;
use App\Services\FalAI\ModelRegistry;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class FalAIService
{
    protected FalClient $client;

    protected ModelRegistry $registry;

    public function __construct(?FalClient $client = null, ?ModelRegistry $registry = null)
    {
        $this->client = $client ?? new FalClient;
        $this->registry = $registry ?? new ModelRegistry;
    }

    /**
     * Generate content based on the generation type.
     */
    public function generate(Generation $generation): GenerationResult
    {
        try {
            return match ($generation->type) {
                GenerationType::TextToImage => $this->generateImage($generation),
                GenerationType::ImageToVideo => $this->generateVideo($generation),
                GenerationType::TextToMusic => $this->generateMusic($generation),
                GenerationType::TextToSpeech => $this->generateSpeech($generation),
                GenerationType::TextToSfx => $this->generateSfx($generation),
                GenerationType::SpeechToText => $this->generateTranscription($generation),
            };
        } catch (\Throwable $e) {
            Log::error('Generation failed', [
                'generation_id' => $generation->id,
                'type' => $generation->type->value,
                'error' => $e->getMessage(),
            ]);

            return GenerationResult::failed($e->getMessage());
        }
    }

    /**
     * Get available models for a generation type.
     *
     * @return array<string, array{id: string, name: string, description: string}>
     */
    public function getModels(GenerationType $type): array
    {
        $models = $this->registry->getAllModels()[$type->value] ?? [];

        return array_map(fn ($model) => [
            'id' => $model['id'],
            'name' => $model['name'],
            'description' => $model['description'],
        ], $models);
    }

    /**
     * Get model configuration including parameters.
     *
     * @return array{id: string, name: string, description: string, parameters: array<string, mixed>, defaults: array<string, mixed>}|null
     */
    public function getModelConfig(GenerationType $type, string $modelKey): ?array
    {
        $models = $this->registry->getAllModels()[$type->value] ?? [];
        foreach ($models as $model) {
            if ($model['key'] === $modelKey) {
                return $model;
            }
        }

        return null;
    }

    protected function generateImage(Generation $generation): GenerationResult
    {
        $modelConfig = $this->resolveModelConfig($generation);

        $input = array_merge(
            ['prompt' => $generation->prompt],
            $modelConfig['defaults'],
            $generation->parameters
        );

        $result = $this->client->subscribe(
            $modelConfig['id'],
            $input,
            fn ($status) => $this->updateProgress($generation, $status),
            onSubmit: fn ($requestId) => $this->saveRequestId($generation, $requestId)
        );

        if (empty($result['images'][0]['url'])) {
            return GenerationResult::failed('No image generated');
        }

        $asset = $this->downloadAndSaveAsset(
            $result['images'][0]['url'],
            $generation,
            AssetType::Image,
            'png'
        );

        // Collect alternative images
        $alternatives = [];
        foreach (array_slice($result['images'] ?? [], 1) as $image) {
            if (isset($image['url'])) {
                $alternatives[] = $image['url'];
            }
        }

        return GenerationResult::success(
            $asset->id,
            $result['request_id'] ?? null,
            $alternatives
        );
    }

    protected function generateVideo(Generation $generation): GenerationResult
    {
        $inputAsset = $generation->inputAsset;
        if (! $inputAsset) {
            return GenerationResult::failed('Input image required for video generation');
        }

        $modelConfig = $this->resolveModelConfig($generation);
        $imageUrl = $this->getPublicUrl($inputAsset);

        $input = array_merge(
            [
                'prompt' => $generation->prompt,
                'image_url' => $imageUrl,
            ],
            $modelConfig['defaults'],
            $generation->parameters
        );

        $result = $this->client->subscribe(
            $modelConfig['id'],
            $input,
            fn ($status) => $this->updateProgress($generation, $status),
            pollIntervalMs: 5000,
            maxWaitSeconds: 900,  // Videos can take longer
            onSubmit: fn ($requestId) => $this->saveRequestId($generation, $requestId)
        );

        // Handle different response formats
        $videoUrl = $result['video']['url']
            ?? $result['video_url']
            ?? $result['output']['video_url']
            ?? null;

        if (! $videoUrl) {
            return GenerationResult::failed('No video generated');
        }

        $asset = $this->downloadAndSaveAsset(
            $videoUrl,
            $generation,
            AssetType::Video,
            'mp4'
        );

        return GenerationResult::success($asset->id, $result['request_id'] ?? null);
    }

    protected function generateMusic(Generation $generation): GenerationResult
    {
        $modelConfig = $this->resolveModelConfig($generation);

        $input = array_merge(
            ['prompt' => $generation->prompt],
            $modelConfig['defaults'],
            $generation->parameters
        );

        $result = $this->client->subscribe(
            $modelConfig['id'],
            $input,
            fn ($status) => $this->updateProgress($generation, $status),
            pollIntervalMs: 3000,
            maxWaitSeconds: 600,
            onSubmit: fn ($requestId) => $this->saveRequestId($generation, $requestId)
        );

        // Handle different response formats
        $audioUrl = $result['audio_file']['url']
            ?? $result['audio']['url']
            ?? $result['audio_url']
            ?? null;

        if (! $audioUrl) {
            return GenerationResult::failed('No audio generated');
        }

        $asset = $this->downloadAndSaveAsset(
            $audioUrl,
            $generation,
            AssetType::Audio,
            'mp3'
        );

        return GenerationResult::success($asset->id, $result['request_id'] ?? null);
    }

    protected function generateSpeech(Generation $generation): GenerationResult
    {
        $modelConfig = $this->resolveModelConfig($generation);

        // Different models use different input field names
        $textField = match ($modelConfig['id']) {
            'fal-ai/f5-tts' => 'gen_text',
            'fal-ai/playht/tts/v3' => 'text',
            default => 'prompt',
        };

        $input = array_merge(
            [$textField => $generation->prompt],
            $modelConfig['defaults'],
            $generation->parameters
        );

        $result = $this->client->subscribe(
            $modelConfig['id'],
            $input,
            fn ($status) => $this->updateProgress($generation, $status),
            onSubmit: fn ($requestId) => $this->saveRequestId($generation, $requestId)
        );

        // Handle different response formats
        $audioUrl = $result['audio']['url']
            ?? $result['audio_url']
            ?? $result['output']['url']
            ?? null;

        if (! $audioUrl) {
            return GenerationResult::failed('No speech generated');
        }

        $asset = $this->downloadAndSaveAsset(
            $audioUrl,
            $generation,
            AssetType::Audio,
            'wav'
        );

        return GenerationResult::success($asset->id, $result['request_id'] ?? null);
    }

    protected function generateSfx(Generation $generation): GenerationResult
    {
        $modelConfig = $this->resolveModelConfig($generation);

        $input = array_merge(
            ['prompt' => $generation->prompt],
            $modelConfig['defaults'],
            $generation->parameters
        );

        $result = $this->client->subscribe(
            $modelConfig['id'],
            $input,
            fn ($status) => $this->updateProgress($generation, $status),
            onSubmit: fn ($requestId) => $this->saveRequestId($generation, $requestId)
        );

        // Handle different response formats
        $audioUrl = $result['audio_file']['url']
            ?? $result['audio']['url']
            ?? $result['audio_url']
            ?? null;

        if (! $audioUrl) {
            return GenerationResult::failed('No sound effect generated');
        }

        $asset = $this->downloadAndSaveAsset(
            $audioUrl,
            $generation,
            AssetType::Audio,
            'mp3'
        );

        return GenerationResult::success($asset->id, $result['request_id'] ?? null);
    }

    protected function generateTranscription(Generation $generation): GenerationResult
    {
        $inputAsset = $generation->inputAsset;
        if (! $inputAsset) {
            return GenerationResult::failed('Input audio/video asset required for transcription');
        }

        $audioUrl = $this->getPublicUrl($inputAsset);

        // Request word-level chunks so we can build karaoke captions and
        // regroup words into readable caption segments server-side. Wizper
        // (Whisper v3 Large) accepts the Whisper input schema including
        // chunk_level. See https://fal.ai/models/fal-ai/wizper
        $input = array_merge(
            [
                'audio_url' => $audioUrl,
                'chunk_level' => 'word',
            ],
            $generation->parameters
        );

        // Use wizper model directly since it may not be in the registry
        $modelId = $generation->model ?: 'fal-ai/wizper';

        $result = $this->client->subscribe(
            $modelId,
            $input,
            fn ($status) => $this->updateProgress($generation, $status),
            onSubmit: fn ($requestId) => $this->saveRequestId($generation, $requestId)
        );

        return $this->processTranscriptionResult($result);
    }

    /**
     * @param  array<string, mixed>  $result
     */
    protected function processTranscriptionResult(array $result): GenerationResult
    {
        $text = $result['text'] ?? '';
        $rawChunks = $result['chunks'] ?? [];

        if (empty($text) && empty($rawChunks)) {
            return GenerationResult::failed('No transcription generated');
        }

        [$chunks, $words] = $this->buildCaptionData($rawChunks);

        return GenerationResult::transcription(
            $text,
            $chunks,
            $words,
            $result['request_id'] ?? null,
        );
    }

    /**
     * Build caption segment chunks (each with optional attached word timings)
     * and a flat list of words from raw fal transcription chunks.
     *
     * When the API returns word-level chunks (chunk_level=word) each chunk is a
     * single token, which we regroup into readable caption segments by breaking
     * at pauses longer than 0.6s or when a segment would exceed ~42 characters.
     * When it returns segment-level chunks, they pass through unchanged with no
     * word timings.
     *
     * @param  array<int, array{text?: string, timestamp?: array{0?: int|float|null, 1?: int|float|null}}>  $rawChunks
     * @return array{0: array<int, array{text: string, timestamp: array{0: float, 1: float}, words?: array<int, array{text: string, start_ms: int, end_ms: int}>}>, 1: array<int, array{text: string, start_ms: int, end_ms: int}>}
     */
    protected function buildCaptionData(array $rawChunks): array
    {
        $isWordLevel = true;
        foreach ($rawChunks as $chunk) {
            $chunkText = trim((string) ($chunk['text'] ?? ''));
            if ($chunkText !== '' && preg_match('/\s/', $chunkText) === 1) {
                $isWordLevel = false;
                break;
            }
        }

        if (! $isWordLevel) {
            $chunks = [];
            foreach ($rawChunks as $chunk) {
                $chunkText = trim((string) ($chunk['text'] ?? ''));
                if ($chunkText === '') {
                    continue;
                }
                $timestamp = $chunk['timestamp'] ?? [0, 0];
                $chunks[] = [
                    'text' => $chunkText,
                    'timestamp' => [
                        (float) ($timestamp[0] ?? 0),
                        (float) ($timestamp[1] ?? 0),
                    ],
                ];
            }

            return [$chunks, []];
        }

        // Word-level: build a flat word list first.
        $words = [];
        $lastEndMs = 0;
        foreach ($rawChunks as $chunk) {
            $wordText = trim((string) ($chunk['text'] ?? ''));
            if ($wordText === '') {
                continue;
            }
            $timestamp = $chunk['timestamp'] ?? null;
            $startSec = isset($timestamp[0]) && $timestamp[0] !== null ? (float) $timestamp[0] : null;
            $endSec = isset($timestamp[1]) && $timestamp[1] !== null ? (float) $timestamp[1] : null;

            $startMs = $startSec !== null ? (int) round($startSec * 1000) : $lastEndMs;
            $endMs = $endSec !== null ? (int) round($endSec * 1000) : $startMs;
            if ($endMs < $startMs) {
                $endMs = $startMs;
            }
            $lastEndMs = $endMs;

            $words[] = [
                'text' => $wordText,
                'start_ms' => $startMs,
                'end_ms' => $endMs,
            ];
        }

        $chunks = $this->groupWordsIntoSegments($words);

        return [$chunks, $words];
    }

    /**
     * Group word timings into readable caption segments, breaking at pauses
     * longer than 0.6s or when a segment would exceed ~42 characters.
     *
     * @param  array<int, array{text: string, start_ms: int, end_ms: int}>  $words
     * @return array<int, array{text: string, timestamp: array{0: float, 1: float}, words: array<int, array{text: string, start_ms: int, end_ms: int}>}>
     */
    protected function groupWordsIntoSegments(array $words): array
    {
        $gapThresholdMs = 600;
        $maxChars = 42;

        $segments = [];
        $currentWords = [];
        $currentText = '';
        $currentEndMs = 0;

        foreach ($words as $word) {
            if ($currentWords === []) {
                $currentWords = [$word];
                $currentText = $word['text'];
                $currentEndMs = $word['end_ms'];

                continue;
            }

            $gap = $word['start_ms'] - $currentEndMs;
            $candidateLength = mb_strlen($currentText) + 1 + mb_strlen($word['text']);

            if ($gap > $gapThresholdMs || $candidateLength > $maxChars) {
                $segments[] = $this->buildSegment($currentWords, $currentText);
                $currentWords = [$word];
                $currentText = $word['text'];
                $currentEndMs = $word['end_ms'];

                continue;
            }

            $currentWords[] = $word;
            $currentText .= ' '.$word['text'];
            $currentEndMs = $word['end_ms'];
        }

        if ($currentWords !== []) {
            $segments[] = $this->buildSegment($currentWords, $currentText);
        }

        return $segments;
    }

    /**
     * @param  array<int, array{text: string, start_ms: int, end_ms: int}>  $words
     * @return array{text: string, timestamp: array{0: float, 1: float}, words: array<int, array{text: string, start_ms: int, end_ms: int}>}
     */
    protected function buildSegment(array $words, string $text): array
    {
        $first = $words[array_key_first($words)];
        $last = $words[array_key_last($words)];

        return [
            'text' => $text,
            'timestamp' => [
                $first['start_ms'] / 1000,
                $last['end_ms'] / 1000,
            ],
            'words' => array_values($words),
        ];
    }

    /**
     * @return array{id: string, name: string, description: string, parameters: array<string, mixed>, defaults: array<string, mixed>}
     */
    protected function resolveModelConfig(Generation $generation): array
    {
        // Check if a specific model key was provided in parameters
        $modelKey = $generation->parameters['model_key'] ?? null;

        if ($modelKey) {
            $config = $this->getModelConfig($generation->type, $modelKey);
            if ($config) {
                return $config;
            }

            // Model key might be a direct fal.ai endpoint ID (catalog model)
            if (str_contains($modelKey, '/')) {
                return $this->createCatalogModelConfig($modelKey);
            }
        }

        // Check if model ID was directly specified (catalog models use this)
        if ($generation->model) {
            // First try to find in our registry by ID
            $models = $this->registry->getAllModels()[$generation->type->value] ?? [];
            foreach ($models as $config) {
                if ($config['id'] === $generation->model) {
                    return $config;
                }
            }

            // If not found and looks like a fal.ai endpoint, treat as catalog model
            if (str_contains($generation->model, '/')) {
                return $this->createCatalogModelConfig($generation->model);
            }
        }

        // Fall back to default model
        $models = $this->registry->getAllModels()[$generation->type->value] ?? [];
        if (! empty($models)) {
            return $models[array_key_first($models)];
        }

        throw new \RuntimeException("No models available for {$generation->type->value}");
    }

    /**
     * Create a minimal model config for catalog models (not in our registry).
     *
     * @return array{id: string, name: string, description: string, parameters: array<string, mixed>, defaults: array<string, mixed>}
     */
    protected function createCatalogModelConfig(string $endpointId): array
    {
        return [
            'id' => $endpointId,
            'name' => $endpointId,
            'description' => 'Catalog model',
            'parameters' => [],
            'defaults' => [],
        ];
    }

    /**
     * @param  array{status: string, progress?: float, logs?: array<mixed>}  $status
     */
    protected function updateProgress(Generation $generation, array $status): void
    {
        // Could update generation progress here if needed
        Log::debug('Generation progress', [
            'generation_id' => $generation->id,
            'status' => $status['status'] ?? 'UNKNOWN',
            'progress' => $status['progress'] ?? null,
        ]);
    }

    /**
     * Save request_id immediately after submission for recovery purposes.
     */
    protected function saveRequestId(Generation $generation, string $requestId): void
    {
        $generation->update(['fal_request_id' => $requestId]);

        Log::info('Saved fal_request_id for generation', [
            'generation_id' => $generation->id,
            'fal_request_id' => $requestId,
        ]);
    }

    /**
     * Resume/check a stuck generation using its saved fal_request_id.
     */
    public function resumeGeneration(Generation $generation): GenerationResult
    {
        if (! $generation->fal_request_id) {
            return GenerationResult::failed('No fal_request_id saved for this generation');
        }

        $modelConfig = $this->resolveModelConfig($generation);

        try {
            // First, check the current status
            $status = $this->client->checkStatus($modelConfig['id'], $generation->fal_request_id);
            $currentStatus = strtoupper($status['status'] ?? 'UNKNOWN');

            Log::info('Checking stuck generation status', [
                'generation_id' => $generation->id,
                'fal_request_id' => $generation->fal_request_id,
                'status' => $currentStatus,
            ]);

            if ($currentStatus === 'COMPLETED') {
                // Get the result and process it
                $result = $this->client->getResult($modelConfig['id'], $generation->fal_request_id);

                return $this->processCompletedResult($generation, $modelConfig, $result);
            }

            if ($currentStatus === 'FAILED') {
                $error = $status['error'] ?? 'Generation failed on fal.ai';

                return GenerationResult::failed($error);
            }

            // Still processing - poll until complete
            $result = $this->client->pollUntilComplete(
                $modelConfig['id'],
                $generation->fal_request_id,
                fn ($s) => $this->updateProgress($generation, $s)
            );

            return $this->processCompletedResult($generation, $modelConfig, $result);
        } catch (\Throwable $e) {
            Log::error('Resume generation failed', [
                'generation_id' => $generation->id,
                'error' => $e->getMessage(),
            ]);

            return GenerationResult::failed($e->getMessage());
        }
    }

    /**
     * Process a completed fal.ai result based on generation type.
     *
     * @param  array{id: string, name: string, description: string, parameters: array<string, mixed>, defaults: array<string, mixed>}  $modelConfig
     * @param  array<string, mixed>  $result
     */
    protected function processCompletedResult(Generation $generation, array $modelConfig, array $result): GenerationResult
    {
        return match ($generation->type) {
            GenerationType::TextToImage => $this->processImageResult($generation, $result),
            GenerationType::ImageToVideo => $this->processVideoResult($generation, $result),
            GenerationType::TextToMusic, GenerationType::TextToSfx => $this->processMusicResult($generation, $result),
            GenerationType::TextToSpeech => $this->processSpeechResult($generation, $result),
            GenerationType::SpeechToText => $this->processTranscriptionResult($result),
        };
    }

    /**
     * @param  array<string, mixed>  $result
     */
    protected function processImageResult(Generation $generation, array $result): GenerationResult
    {
        if (empty($result['images'][0]['url'])) {
            return GenerationResult::failed('No image in result');
        }

        $asset = $this->downloadAndSaveAsset(
            $result['images'][0]['url'],
            $generation,
            AssetType::Image,
            'png'
        );

        $alternatives = [];
        foreach (array_slice($result['images'] ?? [], 1) as $image) {
            if (isset($image['url'])) {
                $alternatives[] = $image['url'];
            }
        }

        return GenerationResult::success($asset->id, $result['request_id'] ?? null, $alternatives);
    }

    /**
     * @param  array<string, mixed>  $result
     */
    protected function processVideoResult(Generation $generation, array $result): GenerationResult
    {
        $videoUrl = $result['video']['url']
            ?? $result['video_url']
            ?? $result['output']['video_url']
            ?? null;

        if (! $videoUrl) {
            return GenerationResult::failed('No video in result');
        }

        $asset = $this->downloadAndSaveAsset($videoUrl, $generation, AssetType::Video, 'mp4');

        return GenerationResult::success($asset->id, $result['request_id'] ?? null);
    }

    /**
     * @param  array<string, mixed>  $result
     */
    protected function processMusicResult(Generation $generation, array $result): GenerationResult
    {
        $audioUrl = $result['audio_file']['url']
            ?? $result['audio']['url']
            ?? $result['audio_url']
            ?? null;

        if (! $audioUrl) {
            return GenerationResult::failed('No audio in result');
        }

        $asset = $this->downloadAndSaveAsset($audioUrl, $generation, AssetType::Audio, 'mp3');

        return GenerationResult::success($asset->id, $result['request_id'] ?? null);
    }

    /**
     * @param  array<string, mixed>  $result
     */
    protected function processSpeechResult(Generation $generation, array $result): GenerationResult
    {
        $audioUrl = $result['audio']['url']
            ?? $result['audio_url']
            ?? $result['output']['url']
            ?? null;

        if (! $audioUrl) {
            return GenerationResult::failed('No speech in result');
        }

        $asset = $this->downloadAndSaveAsset($audioUrl, $generation, AssetType::Audio, 'wav');

        return GenerationResult::success($asset->id, $result['request_id'] ?? null);
    }

    protected function downloadAndSaveAsset(
        string $url,
        Generation $generation,
        AssetType $type,
        string $extension
    ): Asset {
        $content = $this->client->downloadFile($url);
        $disk = config('filesystems.default');

        $filename = Str::uuid().'.'.$extension;
        $path = 'assets/'.$generation->project_id.'/generated/'.$filename;

        // Transcode video to H.264 for browser compatibility
        if ($type === AssetType::Video) {
            $tempPath = sys_get_temp_dir().'/'.$filename;
            file_put_contents($tempPath, $content);
            $this->transcodeToH264($tempPath);
            $content = file_get_contents($tempPath);
            @unlink($tempPath);
        }

        Storage::disk($disk)->put($path, $content);

        return Asset::create([
            'user_id' => $generation->user_id,
            'project_id' => $generation->project_id,
            'type' => $type,
            'source' => AssetSource::Generated,
            'name' => Str::limit($generation->prompt, 50).'.'.$extension,
            'path' => $path,
            'disk' => $disk,
            'mime_type' => $this->getMimeType($type, $extension),
            'size_bytes' => strlen($content),
            'metadata' => [
                'generation_id' => $generation->id,
                'prompt' => $generation->prompt,
                'model' => $generation->model,
            ],
        ]);
    }

    /**
     * Transcode video to H.264 for browser compatibility.
     */
    protected function transcodeToH264(string $inputPath): void
    {
        $tempOutput = $inputPath.'.transcoded.mp4';

        $result = Process::timeout(600)->run([
            'ffmpeg', '-y',
            '-i', $inputPath,
            '-c:v', 'libx264',
            '-profile:v', 'high',
            '-level', '4.0',
            '-pix_fmt', 'yuv420p',
            '-preset', 'fast',
            '-crf', '23',
            '-c:a', 'aac',
            '-ar', '44100',
            '-b:a', '128k',
            '-movflags', '+faststart',
            $tempOutput,
        ]);

        if ($result->successful() && file_exists($tempOutput)) {
            // Replace original with transcoded version
            unlink($inputPath);
            rename($tempOutput, $inputPath);
            Log::info('Video transcoded to H.264', ['path' => $inputPath]);
        } else {
            // Clean up temp file if transcoding failed
            @unlink($tempOutput);
            Log::warning('Video transcoding failed, keeping original', [
                'path' => $inputPath,
                'error' => $result->errorOutput(),
            ]);
        }
    }

    protected function getMimeType(AssetType $type, string $extension): string
    {
        return match ($type) {
            AssetType::Image => match ($extension) {
                'png' => 'image/png',
                'jpg', 'jpeg' => 'image/jpeg',
                'webp' => 'image/webp',
                default => 'image/'.$extension,
            },
            AssetType::Video => 'video/mp4',
            AssetType::Audio => match ($extension) {
                'wav' => 'audio/wav',
                'mp3' => 'audio/mpeg',
                'ogg' => 'audio/ogg',
                default => 'audio/'.$extension,
            },
        };
    }

    protected function getPublicUrl(Asset $asset): string
    {
        // Upload to fal.ai storage to get a publicly accessible URL
        $disk = Storage::disk($asset->disk);

        if (! $disk->exists($asset->path)) {
            throw new \RuntimeException("Asset file not found: {$asset->path}");
        }

        $content = $disk->get($asset->path);
        $filename = basename($asset->path);

        return $this->client->uploadFile($content, $filename, $asset->mime_type);
    }
}

class GenerationResult
{
    public function __construct(
        public bool $success,
        public ?int $assetId = null,
        public ?string $requestId = null,
        /** @var array<string> */
        public array $alternatives = [],
        public ?string $error = null,
        public ?string $transcriptionText = null,
        /** @var array<array{text: string, timestamp: array{0: float, 1: float}, words?: array<array{text: string, start_ms: int, end_ms: int}>}>|null */
        public ?array $transcriptionChunks = null,
        /** @var array<array{text: string, start_ms: int, end_ms: int}>|null */
        public ?array $transcriptionWords = null,
    ) {}

    /**
     * @param  array<string>  $alternatives
     */
    public static function success(int $assetId, ?string $requestId = null, array $alternatives = []): self
    {
        return new self(true, $assetId, $requestId, $alternatives);
    }

    public static function failed(string $error): self
    {
        return new self(false, error: $error);
    }

    /**
     * @param  array<array{text: string, timestamp: array{0: float, 1: float}, words?: array<array{text: string, start_ms: int, end_ms: int}>}>  $chunks
     * @param  array<array{text: string, start_ms: int, end_ms: int}>  $words
     */
    public static function transcription(string $text, array $chunks, array $words = [], ?string $requestId = null): self
    {
        return new self(
            success: true,
            requestId: $requestId,
            transcriptionText: $text,
            transcriptionChunks: $chunks,
            transcriptionWords: $words,
        );
    }
}
