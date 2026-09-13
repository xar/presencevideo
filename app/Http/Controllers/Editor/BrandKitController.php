<?php

namespace App\Http\Controllers\Editor;

use App\Enums\AssetType;
use App\Http\Controllers\Controller;
use App\Http\Requests\Editor\StoreBrandKitRequest;
use App\Http\Requests\Editor\UpdateBrandKitRequest;
use App\Models\BrandKit;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class BrandKitController extends Controller
{
    /**
     * List the user's brand kits with the assets a kit may reference.
     */
    public function index(Request $request): Response
    {
        $user = $request->user();

        return Inertia::render('brand-kits/Index', [
            'brandKits' => $user->brandKits()->orderBy('name')->get(),
            'imageAssets' => $user->assets()->where('type', AssetType::Image)->orderByDesc('created_at')->get(),
            'videoAssets' => $user->assets()->where('type', AssetType::Video)->orderByDesc('created_at')->get(),
            'audioAssets' => $user->assets()->where('type', AssetType::Audio)->orderByDesc('created_at')->get(),
        ]);
    }

    /**
     * Store a newly created brand kit.
     */
    public function store(StoreBrandKitRequest $request): RedirectResponse
    {
        $request->user()->brandKits()->create($request->validated());

        return back();
    }

    /**
     * Update the specified brand kit.
     */
    public function update(UpdateBrandKitRequest $request, BrandKit $brandKit): RedirectResponse
    {
        $this->authorize('update', $brandKit);

        $brandKit->update($request->validated());

        return back();
    }

    /**
     * Remove the specified brand kit. Projects keep working: the FK nulls out
     * and every `brand.*` token falls back to its default.
     */
    public function destroy(Request $request, BrandKit $brandKit): RedirectResponse
    {
        $this->authorize('delete', $brandKit);

        $brandKit->delete();

        return back();
    }
}
