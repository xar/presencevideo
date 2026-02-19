<?php

namespace App\Services;

use App\Enums\AssetSource;
use App\Enums\AssetType;
use App\Enums\GenerationType;
use App\Models\Asset;
use App\Models\Generation;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class FalAIService
{
    protected string $baseUrl = 'https://queue.fal.run';

    protected function client(): PendingRequest
    {
        return Http::withHeaders([
            'Authorization' => 'Key '.config('services.fal.key'),
            'Content-Type' => 'application/json',
        ])->timeout(300);
    }

    public function generate(Generation $generation): GenerationResult
    {
        return match ($generation->type) {
            GenerationType::TextToImage => $this->generateImage($generation),
            GenerationType::ImageToVideo => $this->generateVideo($generation),
            GenerationType::TextToMusic => $this->generateMusic($generation),
            GenerationType::TextToSpeech => $this->generateSpeech($generation),
            GenerationType::TextToSfx => $this->generateSfx($generation),
        };
    }

    protected function generateImage(Generation $generation): GenerationResult
    {
        $params = array_merge([
            'prompt' => $generation->prompt,
            'image_size' => 'portrait_16_9',
            'num_images' => 1,
        ], $generation->parameters);

        $response = $this->client()->post($this->baseUrl.'/'.$generation->model, $params);

        if (! $response->successful()) {
            return GenerationResult::failed($response->json('detail', 'Generation failed'));
        }

        $data = $response->json();

        if (! isset($data['images'][0]['url'])) {
            return GenerationResult::failed('No image generated');
        }

        $asset = $this->downloadAndSaveAsset(
            $data['images'][0]['url'],
            $generation,
            AssetType::Image,
            'jpg'
        );

        $alternatives = [];
        foreach (array_slice($data['images'] ?? [], 1) as $image) {
            if (isset($image['url'])) {
                $alternatives[] = $image['url'];
            }
        }

        return GenerationResult::success($asset->id, $data['request_id'] ?? null, $alternatives);
    }

    protected function generateVideo(Generation $generation): GenerationResult
    {
        $inputAsset = $generation->inputAsset;
        if (! $inputAsset) {
            return GenerationResult::failed('Input image required for video generation');
        }

        $imageUrl = $this->getPublicUrl($inputAsset);

        $params = array_merge([
            'prompt' => $generation->prompt,
            'image_url' => $imageUrl,
            'duration' => '5',
            'aspect_ratio' => '9:16',
        ], $generation->parameters);

        $response = $this->client()->post($this->baseUrl.'/'.$generation->model, $params);

        if (! $response->successful()) {
            return GenerationResult::failed($response->json('detail', 'Video generation failed'));
        }

        $data = $response->json();
        $requestId = $data['request_id'] ?? null;

        $result = $this->pollForResult($generation->model, $requestId);

        if (! $result['success']) {
            return GenerationResult::failed($result['error'] ?? 'Video generation timed out');
        }

        if (! isset($result['video']['url'])) {
            return GenerationResult::failed('No video generated');
        }

        $asset = $this->downloadAndSaveAsset(
            $result['video']['url'],
            $generation,
            AssetType::Video,
            'mp4'
        );

        return GenerationResult::success($asset->id, $requestId);
    }

    protected function generateMusic(Generation $generation): GenerationResult
    {
        $params = array_merge([
            'prompt' => $generation->prompt,
            'seconds_total' => 30,
        ], $generation->parameters);

        $response = $this->client()->post($this->baseUrl.'/'.$generation->model, $params);

        if (! $response->successful()) {
            return GenerationResult::failed($response->json('detail', 'Music generation failed'));
        }

        $data = $response->json();
        $requestId = $data['request_id'] ?? null;

        $result = $this->pollForResult($generation->model, $requestId);

        if (! $result['success']) {
            return GenerationResult::failed($result['error'] ?? 'Music generation timed out');
        }

        if (! isset($result['audio_file']['url'])) {
            return GenerationResult::failed('No audio generated');
        }

        $asset = $this->downloadAndSaveAsset(
            $result['audio_file']['url'],
            $generation,
            AssetType::Audio,
            'mp3'
        );

        return GenerationResult::success($asset->id, $requestId);
    }

    protected function generateSpeech(Generation $generation): GenerationResult
    {
        $params = array_merge([
            'gen_text' => $generation->prompt,
            'ref_audio_url' => null,
        ], $generation->parameters);

        $response = $this->client()->post($this->baseUrl.'/'.$generation->model, $params);

        if (! $response->successful()) {
            return GenerationResult::failed($response->json('detail', 'Speech generation failed'));
        }

        $data = $response->json();

        if (! isset($data['audio_url'])) {
            return GenerationResult::failed('No speech generated');
        }

        $asset = $this->downloadAndSaveAsset(
            $data['audio_url'],
            $generation,
            AssetType::Audio,
            'wav'
        );

        return GenerationResult::success($asset->id, $data['request_id'] ?? null);
    }

    protected function generateSfx(Generation $generation): GenerationResult
    {
        $params = array_merge([
            'prompt' => $generation->prompt,
            'seconds_total' => 10,
        ], $generation->parameters);

        $response = $this->client()->post($this->baseUrl.'/'.$generation->model, $params);

        if (! $response->successful()) {
            return GenerationResult::failed($response->json('detail', 'SFX generation failed'));
        }

        $data = $response->json();
        $requestId = $data['request_id'] ?? null;

        $result = $this->pollForResult($generation->model, $requestId);

        if (! $result['success']) {
            return GenerationResult::failed($result['error'] ?? 'SFX generation timed out');
        }

        if (! isset($result['audio_file']['url'])) {
            return GenerationResult::failed('No SFX generated');
        }

        $asset = $this->downloadAndSaveAsset(
            $result['audio_file']['url'],
            $generation,
            AssetType::Audio,
            'mp3'
        );

        return GenerationResult::success($asset->id, $requestId);
    }

    /**
     * @return array<string, mixed>
     */
    protected function pollForResult(string $model, ?string $requestId, int $maxAttempts = 120): array
    {
        if (! $requestId) {
            return ['success' => false, 'error' => 'No request ID'];
        }

        $statusUrl = $this->baseUrl.'/'.$model.'/requests/'.$requestId.'/status';

        for ($i = 0; $i < $maxAttempts; $i++) {
            sleep(5);

            $response = $this->client()->get($statusUrl);

            if (! $response->successful()) {
                continue;
            }

            $data = $response->json();
            $status = $data['status'] ?? 'unknown';

            if ($status === 'COMPLETED') {
                $resultResponse = $this->client()->get(
                    $this->baseUrl.'/'.$model.'/requests/'.$requestId
                );

                if ($resultResponse->successful()) {
                    return array_merge(['success' => true], $resultResponse->json());
                }
            }

            if ($status === 'FAILED') {
                return ['success' => false, 'error' => $data['error'] ?? 'Generation failed'];
            }
        }

        return ['success' => false, 'error' => 'Generation timed out'];
    }

    protected function downloadAndSaveAsset(
        string $url,
        Generation $generation,
        AssetType $type,
        string $extension
    ): Asset {
        $content = Http::timeout(120)->get($url)->body();

        $filename = Str::uuid().'.'.$extension;
        $path = 'assets/'.$generation->project_id.'/generated/'.$filename;

        Storage::disk('local')->put($path, $content);

        return Asset::create([
            'user_id' => $generation->user_id,
            'project_id' => $generation->project_id,
            'type' => $type,
            'source' => AssetSource::Generated,
            'name' => Str::limit($generation->prompt, 50).'.'.$extension,
            'path' => $path,
            'disk' => 'local',
            'mime_type' => $this->getMimeType($type, $extension),
            'size_bytes' => strlen($content),
            'metadata' => [
                'generation_id' => $generation->id,
                'prompt' => $generation->prompt,
            ],
        ]);
    }

    protected function getMimeType(AssetType $type, string $extension): string
    {
        return match ($type) {
            AssetType::Image => 'image/'.$extension,
            AssetType::Video => 'video/mp4',
            AssetType::Audio => match ($extension) {
                'wav' => 'audio/wav',
                'mp3' => 'audio/mpeg',
                default => 'audio/'.$extension,
            },
        };
    }

    protected function getPublicUrl(Asset $asset): string
    {
        return Storage::disk($asset->disk)->url($asset->path);
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
        public ?string $error = null
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
}
