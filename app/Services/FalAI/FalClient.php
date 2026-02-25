<?php

namespace App\Services\FalAI;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class FalClient
{
    protected string $queueUrl = 'https://queue.fal.run';

    protected string $resultUrl = 'https://fal.run';

    protected string $platformUrl = 'https://api.fal.ai';

    public function __construct(
        protected ?string $apiKey = null
    ) {
        $this->apiKey = $apiKey ?? config('services.fal.key');
    }

    protected function client(): PendingRequest
    {
        return Http::withHeaders([
            'Authorization' => 'Key '.$this->apiKey,
            'Content-Type' => 'application/json',
        ])->timeout(300);
    }

    /**
     * Submit a generation request to the queue.
     *
     * @param  array<string, mixed>  $input
     * @return array{request_id: string, status_url: string, response_url: string}
     */
    public function submit(string $model, array $input): array
    {
        $response = $this->client()->post("{$this->queueUrl}/{$model}", $input);

        if (! $response->successful()) {
            $error = $response->json('detail', 'Failed to submit generation');
            Log::error('Fal.ai submit failed', [
                'model' => $model,
                'status' => $response->status(),
                'error' => $error,
            ]);

            throw new \RuntimeException($error);
        }

        $data = $response->json();
        $requestId = $data['request_id'];

        // Use the response_url from fal.ai as the base for status/result URLs
        // This handles models with subpaths correctly
        $responseUrl = $data['response_url'] ?? "{$this->queueUrl}/{$model}/requests/{$requestId}";

        return [
            'request_id' => $requestId,
            'status_url' => $responseUrl.'/status',
            'response_url' => $responseUrl,
        ];
    }

    /**
     * Check the status of a generation request using the status URL.
     *
     * @return array{status: string, progress?: float, logs?: array<mixed>}
     */
    public function checkStatusByUrl(string $statusUrl): array
    {
        $response = $this->client()->get($statusUrl);

        if (! $response->successful()) {
            Log::warning('Fal.ai status check failed', [
                'url' => $statusUrl,
                'status_code' => $response->status(),
                'body' => $response->body(),
            ]);

            return [
                'status' => 'UNKNOWN',
                'error' => "HTTP {$response->status()}: {$response->body()}",
            ];
        }

        return $response->json();
    }

    /**
     * Check the status of a generation request (legacy - constructs URL from model/requestId).
     *
     * @return array{status: string, progress?: float, logs?: array<mixed>}
     */
    public function checkStatus(string $model, string $requestId): array
    {
        $url = "{$this->queueUrl}/{$model}/requests/{$requestId}/status";

        return $this->checkStatusByUrl($url);
    }

    /**
     * Get the result of a completed generation using the response URL.
     *
     * @return array<string, mixed>
     */
    public function getResultByUrl(string $responseUrl): array
    {
        $response = $this->client()->get($responseUrl);

        if (! $response->successful()) {
            throw new \RuntimeException('Failed to get generation result: '.$response->body());
        }

        return $response->json();
    }

    /**
     * Get the result of a completed generation (legacy - constructs URL from model/requestId).
     *
     * @return array<string, mixed>
     */
    public function getResult(string $model, string $requestId): array
    {
        $url = "{$this->queueUrl}/{$model}/requests/{$requestId}";

        return $this->getResultByUrl($url);
    }

    /**
     * Cancel a pending generation request.
     */
    public function cancel(string $model, string $requestId): bool
    {
        $response = $this->client()->put(
            "{$this->queueUrl}/{$model}/requests/{$requestId}/cancel"
        );

        return $response->successful();
    }

    /**
     * Subscribe to a generation (poll until complete).
     *
     * @param  array<string, mixed>  $input
     * @param  callable|null  $onProgress  Called with status updates
     * @param  callable|null  $onSubmit  Called with request_id immediately after submission
     * @return array<string, mixed>
     */
    public function subscribe(
        string $model,
        array $input,
        ?callable $onProgress = null,
        int $pollIntervalMs = 2000,
        int $maxWaitSeconds = 600,
        ?callable $onSubmit = null
    ): array {
        $submission = $this->submit($model, $input);
        $requestId = $submission['request_id'];
        $statusUrl = $submission['status_url'];
        $responseUrl = $submission['response_url'];

        Log::info('Fal.ai generation submitted', [
            'model' => $model,
            'request_id' => $requestId,
            'status_url' => $statusUrl,
        ]);

        // Notify caller of request_id immediately so it can be saved for recovery
        if ($onSubmit) {
            $onSubmit($requestId);
        }

        return $this->pollUntilCompleteWithUrls($statusUrl, $responseUrl, $onProgress, $pollIntervalMs, $maxWaitSeconds);
    }

    /**
     * Poll a request until complete using URLs (preferred method).
     *
     * @param  callable|null  $onProgress  Called with status updates
     * @return array<string, mixed>
     */
    public function pollUntilCompleteWithUrls(
        string $statusUrl,
        string $responseUrl,
        ?callable $onProgress = null,
        int $pollIntervalMs = 2000,
        int $maxWaitSeconds = 600
    ): array {
        $startTime = time();
        $pollIntervalSeconds = $pollIntervalMs / 1000;
        $consecutiveUnknown = 0;
        $maxConsecutiveUnknown = 10;

        while (true) {
            if ((time() - $startTime) > $maxWaitSeconds) {
                throw new \RuntimeException("Generation timed out after {$maxWaitSeconds}s");
            }

            $status = $this->checkStatusByUrl($statusUrl);
            $currentStatus = strtoupper($status['status'] ?? 'UNKNOWN');

            Log::debug('Fal.ai poll status', [
                'status_url' => $statusUrl,
                'status' => $currentStatus,
            ]);

            if ($onProgress) {
                $onProgress($status);
            }

            if ($currentStatus === 'COMPLETED') {
                Log::info('Fal.ai generation completed', [
                    'response_url' => $responseUrl,
                ]);

                return $this->getResultByUrl($responseUrl);
            }

            if ($currentStatus === 'FAILED') {
                $error = $status['error'] ?? 'Generation failed';
                Log::error('Fal.ai generation failed', [
                    'status_url' => $statusUrl,
                    'error' => $error,
                ]);
                throw new \RuntimeException($error);
            }

            // Track consecutive UNKNOWN statuses to detect persistent API failures
            if ($currentStatus === 'UNKNOWN') {
                $consecutiveUnknown++;
                if ($consecutiveUnknown >= $maxConsecutiveUnknown) {
                    $error = $status['error'] ?? 'Status check failed repeatedly';
                    Log::error('Fal.ai status check failed repeatedly', [
                        'status_url' => $statusUrl,
                        'consecutive_failures' => $consecutiveUnknown,
                        'last_error' => $error,
                    ]);
                    throw new \RuntimeException("Status check failed {$consecutiveUnknown} times: {$error}");
                }
            } else {
                $consecutiveUnknown = 0;
            }

            usleep((int) ($pollIntervalSeconds * 1_000_000));
        }
    }

    /**
     * Poll a request until complete (legacy - constructs URLs from model/requestId).
     *
     * @param  callable|null  $onProgress  Called with status updates
     * @return array<string, mixed>
     */
    public function pollUntilComplete(
        string $model,
        string $requestId,
        ?callable $onProgress = null,
        int $pollIntervalMs = 2000,
        int $maxWaitSeconds = 600
    ): array {
        $statusUrl = "{$this->queueUrl}/{$model}/requests/{$requestId}/status";
        $responseUrl = "{$this->queueUrl}/{$model}/requests/{$requestId}";

        return $this->pollUntilCompleteWithUrls($statusUrl, $responseUrl, $onProgress, $pollIntervalMs, $maxWaitSeconds);
    }

    /**
     * Download a file from a URL.
     */
    public function downloadFile(string $url): string
    {
        $response = Http::timeout(120)->get($url);

        if (! $response->successful()) {
            throw new \RuntimeException('Failed to download file');
        }

        return $response->body();
    }

    /**
     * Upload a file to fal.ai storage and get a CDN URL.
     *
     * @param  string  $content  File contents
     * @param  string  $filename  Original filename
     * @param  string  $contentType  MIME type
     * @return string CDN URL for the uploaded file
     */
    public function uploadFile(string $content, string $filename, string $contentType): string
    {
        // Step 1: Initiate upload to get presigned URL
        $initiateResponse = Http::withHeaders([
            'Authorization' => 'Key '.$this->apiKey,
            'Accept' => 'application/json',
        ])->post('https://rest.alpha.fal.ai/storage/upload/initiate', [
            'file_name' => $filename,
            'content_type' => $contentType,
        ]);

        if (! $initiateResponse->successful()) {
            Log::error('Fal.ai upload initiate failed', [
                'status' => $initiateResponse->status(),
                'error' => $initiateResponse->body(),
            ]);
            throw new \RuntimeException('Failed to initiate file upload: '.$initiateResponse->body());
        }

        $uploadData = $initiateResponse->json();
        $uploadUrl = $uploadData['upload_url'] ?? null;
        $fileUrl = $uploadData['file_url'] ?? null;

        if (! $uploadUrl || ! $fileUrl) {
            throw new \RuntimeException('Invalid upload initiation response');
        }

        // Step 2: Upload the file to the presigned URL
        $uploadResponse = Http::withHeaders([
            'Content-Type' => $contentType,
        ])->withBody($content, $contentType)->put($uploadUrl);

        if (! $uploadResponse->successful()) {
            Log::error('Fal.ai file upload failed', [
                'status' => $uploadResponse->status(),
                'error' => $uploadResponse->body(),
            ]);
            throw new \RuntimeException('Failed to upload file: '.$uploadResponse->body());
        }

        Log::info('File uploaded to fal.ai storage', [
            'filename' => $filename,
            'url' => $fileUrl,
        ]);

        return $fileUrl;
    }

    /**
     * Upload a local file path to fal.ai storage.
     *
     * @param  string  $path  Local file path
     * @param  string  $contentType  MIME type
     * @return string CDN URL for the uploaded file
     */
    public function uploadLocalFile(string $path, string $contentType): string
    {
        if (! file_exists($path)) {
            throw new \RuntimeException("File not found: {$path}");
        }

        $content = file_get_contents($path);
        $filename = basename($path);

        return $this->uploadFile($content, $filename, $contentType);
    }

    /**
     * Search the fal.ai model catalog.
     *
     * @param  array{q?: string, category?: string, limit?: int, cursor?: string}  $params
     * @return array{models: array<int, array{endpoint_id: string, metadata: array<string, mixed>}>, next_cursor: string|null, has_more: bool}
     */
    public function searchModels(array $params = []): array
    {
        $query = array_filter([
            'q' => $params['q'] ?? null,
            'category' => $params['category'] ?? null,
            'limit' => $params['limit'] ?? 20,
            'cursor' => $params['cursor'] ?? null,
            'status' => 'active',
        ]);

        $response = $this->client()->get("{$this->platformUrl}/v1/models", $query);

        if (! $response->successful()) {
            Log::warning('Fal.ai model search failed', [
                'status' => $response->status(),
                'error' => $response->json('error', 'Unknown error'),
            ]);

            return ['models' => [], 'next_cursor' => null, 'has_more' => false];
        }

        return $response->json();
    }

    /**
     * Get a single model by endpoint ID.
     *
     * @return array{endpoint_id: string, metadata: array<string, mixed>}|null
     */
    public function getModel(string $endpointId): ?array
    {
        $response = $this->client()->get("{$this->platformUrl}/v1/models", [
            'endpoint_id' => $endpointId,
            'expand' => 'openapi-3.0',
        ]);

        if (! $response->successful()) {
            return null;
        }

        $data = $response->json();

        return $data['models'][0] ?? null;
    }
}
