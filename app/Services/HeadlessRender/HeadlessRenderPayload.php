<?php

namespace App\Services\HeadlessRender;

use App\Models\Project;

/**
 * The JSON handed to the headless render page.
 *
 * The page runs `exportProjectVideo()` -- the browser export, unchanged -- so
 * the payload is simply the project as the editor would have loaded it, with
 * one substitution: every asset URL is rewritten onto the token-scoped render
 * route. Chrome renders without a session, so the ordinary
 * `editor.assets.stream` URLs would come back as redirects to the login page
 * and every clip would silently decode to nothing.
 */
class HeadlessRenderPayload
{
    /**
     * Build the page payload for a project.
     *
     * @return array{project: array<string, mixed>, fps: int, width: int, height: int}
     */
    public static function forProject(Project $project, string $token): array
    {
        $project->loadMissing('assets');

        $payload = $project->toArray();
        $payload['assets'] = $project->assets
            ->map(fn ($asset): array => static::assetPayload($asset->toArray(), $asset->id, $token))
            ->all();

        return [
            'project' => $payload,
            'fps' => (int) ($project->fps ?: 30),
            'width' => (int) $project->resolution_width,
            'height' => (int) $project->resolution_height,
        ];
    }

    /**
     * Rewrite one asset's URLs onto the token-scoped, session-free routes.
     *
     * @param  array<string, mixed>  $asset
     * @return array<string, mixed>
     */
    protected static function assetPayload(array $asset, int $assetId, string $token): array
    {
        $asset['url'] = route('editor.headless.asset', [
            'token' => $token,
            'asset' => $assetId,
        ]);

        $asset['thumbnail_url'] = isset($asset['thumbnail_url']) && $asset['thumbnail_url'] !== null
            ? route('editor.headless.thumbnail', ['token' => $token, 'asset' => $assetId])
            : null;

        return $asset;
    }
}
