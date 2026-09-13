<?php

namespace App\Http\Controllers\Editor;

use App\Enums\AssetType;
use App\Http\Controllers\Controller;
use App\Http\Requests\Editor\StoreBrandKitRequest;
use App\Http\Requests\Editor\UpdateBrandKitRequest;
use App\Models\BrandKit;
use App\Services\BrandKit\BrandKitIntakePrompt;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
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
     * Mint the capability an outside LLM agent fills a kit with, and return the
     * ready-to-paste prompt that carries it.
     *
     * With no `brand_kit_id` this creates the kit first, so the page's "have an
     * AI build this from our website" button is one click rather than
     * create-then-copy. Minting always replaces any previous token, so copying
     * a new prompt invalidates the old link.
     */
    public function intakeLink(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'brand_kit_id' => ['sometimes', 'nullable', 'integer', Rule::exists('brand_kits', 'id')->where('user_id', $request->user()->id)],
            'website_url' => ['sometimes', 'nullable', 'url', 'max:2048'],
        ]);

        $websiteUrl = $validated['website_url'] ?? null;

        if (($validated['brand_kit_id'] ?? null) !== null) {
            $kit = BrandKit::findOrFail($validated['brand_kit_id']);
            $this->authorize('update', $kit);

            if ($websiteUrl !== null) {
                $kit->update(['website_url' => $websiteUrl]);
            }
        } else {
            $this->authorize('create', BrandKit::class);

            $kit = $request->user()->brandKits()->create([
                'name' => $this->draftNameFor($websiteUrl),
                'website_url' => $websiteUrl,
            ]);
        }

        $token = $kit->issueIntakeToken();

        return response()->json([
            'brand_kit_id' => $kit->id,
            ...BrandKitIntakePrompt::for($kit->fresh(), $token),
        ]);
    }

    /**
     * Revoke a kit's intake link so a prompt already pasted into a chat stops
     * working.
     */
    public function revokeIntakeLink(Request $request, BrandKit $brandKit): JsonResponse
    {
        $this->authorize('update', $brandKit);

        $brandKit->revokeIntakeToken();

        return response()->json(null, 204);
    }

    /**
     * Name a kit after the site it is about, so a page of AI drafts stays
     * readable before any agent has run.
     */
    protected function draftNameFor(?string $websiteUrl): string
    {
        $host = $websiteUrl === null ? null : parse_url($websiteUrl, PHP_URL_HOST);

        return $host === null ? 'New brand kit' : Str::headline(Str::before(Str::after($host, 'www.'), '.'));
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
