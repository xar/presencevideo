<?php

namespace App\Services\HeadlessRender;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * A short-lived capability handed to headless Chrome.
 *
 * Chrome renders with no session, so the render page and the asset bytes it
 * decodes must be reachable without the auth guard. Rather than widening those
 * routes, one opaque token is minted per render and scoped to a single
 * project: it names the project it may read, expires on its own, and is
 * revoked the moment the render finishes. An asset that does not belong to
 * that project is a 403 even with a valid token.
 */
class RenderAccessToken
{
    protected const PREFIX = 'headless-render:';

    /**
     * Mint a token granting read access to one project for `token_ttl` seconds.
     */
    public static function issue(int $projectId, int $renderId): string
    {
        $token = Str::random(64);

        Cache::put(
            self::PREFIX.$token,
            ['project_id' => $projectId, 'render_id' => $renderId],
            (int) config('render.headless.token_ttl', 900),
        );

        return $token;
    }

    /**
     * Resolve a token to the project it grants access to, or null.
     *
     * @return array{project_id: int, render_id: int}|null
     */
    public static function resolve(string $token): ?array
    {
        /** @var array{project_id: int, render_id: int}|null $payload */
        $payload = Cache::get(self::PREFIX.$token);

        return is_array($payload) ? $payload : null;
    }

    public static function revoke(string $token): void
    {
        Cache::forget(self::PREFIX.$token);
    }
}
