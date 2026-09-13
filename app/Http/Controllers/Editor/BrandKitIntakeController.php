<?php

namespace App\Http\Controllers\Editor;

use App\Http\Controllers\Controller;
use App\Http\Requests\Editor\StoreBrandKitRequest;
use App\Models\Asset;
use App\Models\BrandKit;
use App\Services\BrandKit\IntakeAssetImporter;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use RuntimeException;

/**
 * The public half of brand kit intake: a small JSON API an outside LLM agent
 * (ChatGPT, Claude, anything that can curl) uses to fill in ONE brand kit after
 * analysing a website.
 *
 * Deliberately outside the auth guard, for the same reason the headless render
 * routes are: the caller has no session. Access is a single opaque capability
 * minted by the kit's owner — it names the one kit it may write, expires on its
 * own, and grants nothing else. Everything it writes is validated by exactly
 * the rules the authenticated editor uses, with asset ownership pinned to the
 * kit's owner, so a token can never reach another user's data.
 */
class BrandKitIntakeController extends Controller
{
    /**
     * The slots an uploaded asset can be attached to in one step.
     *
     * @var array<int, string>
     */
    public const ASSET_ROLES = ['logo_full', 'logo_mark', 'logo_light', 'logo_dark', 'watermark', 'intro', 'outro'];

    /**
     * Read the kit's current state and the contract for writing to it.
     */
    public function show(string $token): JsonResponse
    {
        $kit = $this->resolveKit($token);

        return response()->json($this->state($kit));
    }

    /**
     * Merge caller-supplied fields into the kit.
     *
     * A merge, not a replace: an agent discovers a brand in passes (palette
     * first, fonts once it has the CSS, logos after it uploads them) and must
     * not wipe what an earlier pass established.
     */
    public function update(Request $request, string $token): JsonResponse
    {
        $kit = $this->resolveKit($token);

        $validator = Validator::make($request->all(), [
            'name' => ['sometimes', 'string', 'max:255'],
            'website_url' => ['sometimes', 'nullable', 'url', 'max:2048'],
            ...StoreBrandKitRequest::kitRules($kit->user_id),
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Some fields were rejected. Fix them and PATCH again; nothing was written.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $kit->update($this->mergeMaps($kit, $validator->validated()));

        return response()->json($this->state($kit->fresh()));
    }

    /**
     * Store a logo, watermark, intro or outro — from a public URL or a
     * multipart upload — and optionally attach it to its slot in one call.
     */
    public function storeAsset(Request $request, string $token): JsonResponse
    {
        $kit = $this->resolveKit($token);

        $validator = Validator::make($request->all(), [
            'source_url' => ['required_without:file', 'nullable', 'url', 'max:2048'],
            'file' => ['required_without:source_url', 'nullable', 'file', 'max:'.(int) (config('brand_intake.max_asset_bytes') / 1024)],
            'name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'role' => ['sometimes', 'nullable', 'string', 'in:'.implode(',', self::ASSET_ROLES)],
        ]);

        if ($validator->fails()) {
            return response()->json(['message' => 'Invalid asset request.', 'errors' => $validator->errors()], 422);
        }

        $importer = app(IntakeAssetImporter::class);
        $name = $validator->validated()['name'] ?? null;

        try {
            $asset = $request->hasFile('file')
                ? $importer->fromUpload($kit, $request->file('file'), $name)
                : $importer->fromUrl($kit, $validator->validated()['source_url'], $name);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $role = $validator->validated()['role'] ?? null;

        if ($role !== null) {
            $this->attach($kit, $role, $asset);
        }

        return response()->json([
            'asset' => ['id' => $asset->id, 'name' => $asset->name, 'type' => $asset->type->value, 'size_bytes' => $asset->size_bytes],
            'attached_to' => $role,
            'brand_kit' => $this->state($kit->fresh())['brand_kit'],
        ], 201);
    }

    /**
     * Attach an asset to the slot the caller named.
     */
    protected function attach(BrandKit $kit, string $role, Asset $asset): void
    {
        if (str_starts_with($role, 'logo_')) {
            $kit->update(['logos' => array_merge($kit->logos ?? [], [substr($role, 5) => $asset->id])]);

            return;
        }

        if ($role === 'watermark') {
            $kit->update(['watermark' => array_merge(
                ['position' => 'bottom-right', 'opacity' => 0.6, 'size' => 0.12],
                $kit->watermark ?? [],
                ['asset_id' => $asset->id],
            )]);

            return;
        }

        $kit->update([$role.'_asset_id' => $asset->id]);
    }

    /**
     * Merge the three role maps instead of replacing them, so a PATCH that
     * names only `colors.primary` leaves the other colour roles alone.
     *
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    protected function mergeMaps(BrandKit $kit, array $validated): array
    {
        foreach (['colors', 'fonts', 'logos'] as $map) {
            if (array_key_exists($map, $validated) && is_array($validated[$map])) {
                $validated[$map] = array_merge($kit->{$map} ?? [], array_filter(
                    $validated[$map],
                    fn ($value): bool => $value !== null,
                ));
            }
        }

        if (array_key_exists('watermark', $validated) && is_array($validated['watermark'])) {
            $validated['watermark'] = array_merge($kit->watermark ?? [], $validated['watermark']);
        }

        return $validated;
    }

    /**
     * The payload every intake response returns: what the kit holds now, the
     * assets it may reference, and where to write next.
     *
     * @return array<string, mixed>
     */
    protected function state(BrandKit $kit): array
    {
        $intakeUrl = route('brand-intake.show', ['token' => $kit->intake_token]);

        return [
            'brand_kit' => $kit->toArray(),
            'available_assets' => $kit->user->assets()
                ->orderByDesc('created_at')
                ->limit(50)
                ->get(['id', 'name', 'type'])
                ->toArray(),
            'expires_at' => $kit->intake_token_expires_at?->toIso8601String(),
            'endpoints' => [
                'read' => "GET {$intakeUrl}",
                'write' => "PATCH {$intakeUrl}",
                'upload' => "POST {$intakeUrl}/assets",
            ],
            'contract' => [
                'color_roles' => BrandKit::COLOR_ROLES,
                'font_roles' => BrandKit::FONT_ROLES,
                'logo_variants' => BrandKit::LOGO_VARIANTS,
                'watermark_positions' => BrandKit::WATERMARK_POSITIONS,
                'asset_roles' => self::ASSET_ROLES,
                'color_format' => '#rrggbb or #rrggbbaa',
                'notes' => 'PATCH merges: send only the fields you determined. Colours must be taken from the site, never invented.',
            ],
        ];
    }

    /**
     * Callers are agents reading JSON, so an unknown or expired token has to
     * fail as JSON too, not as the framework's HTML error page.
     *
     * @throws HttpResponseException
     */
    protected function resolveKit(string $token): BrandKit
    {
        $kit = BrandKit::findByIntakeToken($token);

        if ($kit === null) {
            abort(response()->json([
                'message' => 'This brand kit link is unknown or has expired. Ask the person who gave it to you for a fresh one.',
            ], 404));
        }

        return $kit;
    }
}
