<?php

namespace App\Services\BrandKit;

use App\Enums\AssetSource;
use App\Enums\AssetType;
use App\Jobs\ProcessAssetUpload;
use App\Models\Asset;
use App\Models\BrandKit;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Turns what an intake agent hands us — a public URL or an uploaded file — into
 * an `Asset` owned by the brand kit's user.
 *
 * The URL path is the reason this class is careful: the intake endpoint is
 * public, so "fetch this URL for me" is an SSRF primitive unless the host is
 * checked BEFORE the request and again on every redirect. A caller must not be
 * able to aim it at link-local metadata or anything inside our own network.
 */
class IntakeAssetImporter
{
    /**
     * Mime prefixes the editor can actually use, mapped to the asset type.
     *
     * @var array<string, AssetType>
     */
    protected const TYPE_BY_PREFIX = [
        'image/' => AssetType::Image,
        'video/' => AssetType::Video,
        'audio/' => AssetType::Audio,
    ];

    /**
     * @var array<string, string>
     */
    protected const EXTENSION_BY_MIME = [
        'image/png' => 'png',
        'image/jpeg' => 'jpg',
        'image/webp' => 'webp',
        'image/gif' => 'gif',
        'image/svg+xml' => 'svg',
        'image/avif' => 'avif',
        'image/x-icon' => 'ico',
        'image/vnd.microsoft.icon' => 'ico',
        'video/mp4' => 'mp4',
        'video/webm' => 'webm',
        'video/quicktime' => 'mov',
        'audio/mpeg' => 'mp3',
        'audio/wav' => 'wav',
        'audio/x-wav' => 'wav',
        'audio/ogg' => 'ogg',
        'audio/mp4' => 'm4a',
    ];

    /**
     * Download a caller-supplied URL and store it as an asset of the kit's owner.
     *
     * @throws RuntimeException when the URL is not fetchable, points somewhere
     *                          it must not, is too large, or is not media.
     */
    public function fromUrl(BrandKit $kit, string $url, ?string $name = null): Asset
    {
        $this->assertPublicUrl($url);

        $maxBytes = (int) config('brand_intake.max_asset_bytes');

        $response = Http::timeout((int) config('brand_intake.fetch_timeout'))
            ->withOptions([
                'allow_redirects' => [
                    'max' => 3,
                    'strict' => true,
                    'referer' => false,
                    'protocols' => ['http', 'https'],
                    'on_redirect' => function ($request, $response, $uri): void {
                        $this->assertPublicUrl((string) $uri);
                    },
                ],
            ])
            ->withHeaders(['Accept' => 'image/*,video/*,audio/*;q=0.9,*/*;q=0.8'])
            ->get($url);

        if (! $response->successful()) {
            throw new RuntimeException("Could not fetch {$url}: HTTP {$response->status()}.");
        }

        $declaredLength = (int) $response->header('Content-Length');
        $body = $response->body();

        if ($declaredLength > $maxBytes || strlen($body) > $maxBytes) {
            throw new RuntimeException('That file is larger than the '.round($maxBytes / 1024 / 1024).'MB limit.');
        }

        if ($body === '') {
            throw new RuntimeException("Fetched {$url} but it was empty.");
        }

        $mime = strtolower(trim(explode(';', (string) $response->header('Content-Type'))[0]));

        return $this->store(
            $kit,
            $body,
            $mime,
            $name ?? Str::limit(basename(parse_url($url, PHP_URL_PATH) ?: 'asset'), 80, ''),
            ['source_url' => $url],
        );
    }

    /**
     * Store a multipart upload as an asset of the kit's owner.
     */
    public function fromUpload(BrandKit $kit, UploadedFile $file, ?string $name = null): Asset
    {
        return $this->store(
            $kit,
            (string) file_get_contents($file->getRealPath()),
            strtolower((string) $file->getMimeType()),
            $name ?? $file->getClientOriginalName(),
            [],
        );
    }

    /**
     * @param  array<string, mixed>  $metadata
     */
    protected function store(BrandKit $kit, string $contents, string $mime, string $name, array $metadata): Asset
    {
        $type = $this->assetTypeFor($mime);

        if ($type === null) {
            throw new RuntimeException("Unsupported media type '{$mime}'. Upload an image, video or audio file.");
        }

        $disk = config('filesystems.default');
        $extension = self::EXTENSION_BY_MIME[$mime] ?? explode('/', $mime)[1];
        $path = 'assets/brand-kits/'.$kit->id.'/'.Str::uuid().'.'.$extension;

        Storage::disk($disk)->put($path, $contents);

        $asset = Asset::create([
            'user_id' => $kit->user_id,
            'project_id' => null,
            'type' => $type,
            'source' => AssetSource::Upload,
            'name' => $name !== '' ? $name : 'Brand asset.'.$extension,
            'path' => $path,
            'disk' => $disk,
            'mime_type' => $mime,
            'size_bytes' => strlen($contents),
            'metadata' => array_merge($metadata, ['brand_kit_id' => $kit->id]),
        ]);

        ProcessAssetUpload::dispatch($asset);

        return $asset;
    }

    protected function assetTypeFor(string $mime): ?AssetType
    {
        foreach (self::TYPE_BY_PREFIX as $prefix => $type) {
            if (str_starts_with($mime, $prefix)) {
                return $type;
            }
        }

        return null;
    }

    /**
     * Reject anything that is not a public http(s) URL.
     *
     * @throws RuntimeException
     */
    protected function assertPublicUrl(string $url): void
    {
        $parts = parse_url($url);
        $scheme = strtolower($parts['scheme'] ?? '');
        // parse_url keeps the brackets on an IPv6 literal; the IP validator wants them off.
        $host = trim($parts['host'] ?? '', '[]');

        if (! in_array($scheme, ['http', 'https'], true) || $host === '') {
            throw new RuntimeException('Asset URLs must be absolute http(s) URLs.');
        }

        if (config('brand_intake.allow_private_hosts')) {
            return;
        }

        foreach ($this->resolve($host) as $ip) {
            if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
                throw new RuntimeException("Refusing to fetch {$host}: it resolves to a private or reserved address.");
            }
        }
    }

    /**
     * @return array<int, string>
     */
    protected function resolve(string $host): array
    {
        if (filter_var($host, FILTER_VALIDATE_IP) !== false) {
            return [$host];
        }

        $records = array_merge(
            dns_get_record($host, DNS_A) ?: [],
            dns_get_record($host, DNS_AAAA) ?: [],
        );

        $ips = array_values(array_filter(array_map(
            fn (array $record): ?string => $record['ip'] ?? $record['ipv6'] ?? null,
            $records,
        )));

        if ($ips === []) {
            throw new RuntimeException("Could not resolve {$host}.");
        }

        return $ips;
    }
}
