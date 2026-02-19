<?php

namespace App\Http\Controllers\Editor;

use App\Http\Controllers\Controller;
use App\Http\Requests\Editor\StoreAssetRequest;
use App\Jobs\ProcessAssetUpload;
use App\Models\Asset;
use App\Models\Project;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class AssetController extends Controller
{
    /**
     * Store a newly uploaded asset.
     */
    public function store(StoreAssetRequest $request, Project $project): JsonResponse
    {
        $this->authorize('update', $project);

        $file = $request->file('file');
        $type = $request->validated('type');
        $name = $request->validated('name') ?? $file->getClientOriginalName();

        $path = $file->storeAs(
            'assets/'.$project->id,
            Str::uuid().'.'.$file->getClientOriginalExtension(),
            'local'
        );

        $asset = Asset::create([
            'user_id' => $request->user()->id,
            'project_id' => $project->id,
            'type' => $type,
            'source' => 'upload',
            'name' => $name,
            'path' => $path,
            'disk' => 'local',
            'mime_type' => $file->getMimeType(),
            'size_bytes' => $file->getSize(),
            'metadata' => [],
        ]);

        ProcessAssetUpload::dispatch($asset);

        return response()->json([
            'asset' => $asset,
        ], 201);
    }

    /**
     * Remove the specified asset.
     */
    public function destroy(Request $request, Asset $asset): JsonResponse
    {
        $this->authorize('delete', $asset);

        Storage::disk($asset->disk)->delete($asset->path);

        if ($asset->thumbnail_path) {
            Storage::disk($asset->disk)->delete($asset->thumbnail_path);
        }

        $asset->delete();

        return response()->json(null, 204);
    }
}
