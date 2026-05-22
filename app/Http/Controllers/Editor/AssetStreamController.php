<?php

namespace App\Http\Controllers\Editor;

use App\Http\Controllers\Controller;
use App\Models\Asset;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;

class AssetStreamController extends Controller
{
    /**
     * Stream the asset file.
     */
    public function show(Asset $asset): Response
    {
        $this->authorize('view', $asset);

        $disk = Storage::disk($asset->disk);

        if (! $disk->exists($asset->path)) {
            abort(404);
        }

        $headers = [
            'Content-Type' => $asset->mime_type,
            'Accept-Ranges' => 'bytes',
        ];

        if (($asset->disk === 'local' || $asset->disk === 'public') && method_exists($disk, 'path')) {
            return response()->file($disk->path($asset->path), $headers);
        }

        return $disk->response($asset->path, $asset->name, $headers);
    }

    /**
     * Stream the asset thumbnail.
     */
    public function thumbnail(Asset $asset): Response
    {
        $this->authorize('view', $asset);

        if (! $asset->thumbnail_path) {
            abort(404);
        }

        $disk = Storage::disk($asset->disk);

        if (! $disk->exists($asset->thumbnail_path)) {
            abort(404);
        }

        return $disk->response($asset->thumbnail_path);
    }
}
