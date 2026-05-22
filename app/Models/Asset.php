<?php

namespace App\Models;

use App\Enums\AssetSource;
use App\Enums\AssetType;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

class Asset extends Model
{
    /** @use HasFactory<\Database\Factories\AssetFactory> */
    use HasFactory;

    /**
     * @var list<string>
     */
    protected $appends = ['url', 'thumbnail_url'];

    protected $fillable = [
        'user_id',
        'project_id',
        'type',
        'source',
        'name',
        'path',
        'disk',
        'mime_type',
        'size_bytes',
        'duration_ms',
        'width',
        'height',
        'thumbnail_path',
        'metadata',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'type' => AssetType::class,
            'source' => AssetSource::class,
            'size_bytes' => 'integer',
            'duration_ms' => 'integer',
            'width' => 'integer',
            'height' => 'integer',
            'metadata' => 'array',
        ];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return BelongsTo<Project, $this>
     */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function getUrlAttribute(): string
    {
        return route('editor.assets.stream', $this);
    }

    public function getThumbnailUrlAttribute(): ?string
    {
        if (! $this->thumbnail_path) {
            return null;
        }

        return route('editor.assets.thumbnail', $this);
    }

    public function getFullPathAttribute(): string
    {
        return Storage::disk($this->disk)->path($this->path);
    }

    /**
     * Get a local filesystem path for this asset, downloading from remote storage if needed.
     * For local disk, returns the path directly. For S3/R2, downloads to a temp file.
     * Caller is responsible for cleaning up temp files via Asset::cleanupTempFiles().
     */
    public function getLocalPath(): string
    {
        $disk = Storage::disk($this->disk);

        // Local disk — file is already on the filesystem
        if ($this->disk === 'local' || $this->disk === 'public') {
            return $disk->path($this->path);
        }

        // Remote disk — download to temp
        $extension = pathinfo($this->path, PATHINFO_EXTENSION);
        $tempPath = sys_get_temp_dir().'/asset_'.$this->id.'_'.uniqid().'.'.$extension;

        $stream = $disk->readStream($this->path);
        if ($stream === null) {
            throw new \RuntimeException("Asset file not found in storage: {$this->path} (disk: {$this->disk})");
        }

        $tempFile = fopen($tempPath, 'w');
        stream_copy_to_stream($stream, $tempFile);
        fclose($tempFile);
        fclose($stream);

        // Track temp files for cleanup
        self::$tempFiles[] = $tempPath;

        return $tempPath;
    }

    /** @var list<string> */
    protected static array $tempFiles = [];

    /**
     * Clean up any temp files created by getLocalPath().
     */
    public static function cleanupTempFiles(): void
    {
        foreach (self::$tempFiles as $path) {
            @unlink($path);
        }
        self::$tempFiles = [];
    }
}
