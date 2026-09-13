<?php

namespace App\Http\Controllers\Editor;

use App\Http\Controllers\Controller;
use App\Models\Asset;
use App\Models\Project;
use App\Services\HeadlessRender\HeadlessRenderPayload;
use App\Services\HeadlessRender\RenderAccessToken;
use Illuminate\Contracts\View\View;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;

/**
 * The session-free surface headless Chrome renders against.
 *
 * These routes sit OUTSIDE the auth guard on purpose -- Chrome has no session
 * -- and are guarded instead by a short-lived, single-project capability (see
 * RenderAccessToken). Every method resolves the token first and refuses to
 * serve anything belonging to another project.
 */
class HeadlessRenderController extends Controller
{
    /**
     * The render page itself: a bare host for the browser export bundle.
     */
    public function page(string $token): View
    {
        $project = $this->projectFor($token);

        return view('editor.headless-render', [
            'payload' => HeadlessRenderPayload::forProject($project, $token),
        ]);
    }

    /**
     * Stream one of the project's asset files.
     *
     * mediabunny decodes through range requests, so this must answer 206 with a
     * Content-Range exactly as the authenticated stream route does; Symfony's
     * file response handles that for local disks.
     */
    public function asset(string $token, Asset $asset): Response
    {
        $project = $this->projectFor($token);

        abort_unless($asset->project_id === $project->id, 403);

        $disk = Storage::disk($asset->disk);

        abort_unless($disk->exists($asset->path), 404);

        $headers = [
            'Content-Type' => $asset->mime_type,
            'Accept-Ranges' => 'bytes',
        ];

        if (($asset->disk === 'local' || $asset->disk === 'public') && method_exists($disk, 'path')) {
            return response()->file($disk->path($asset->path), $headers);
        }

        return $disk->response($asset->path, $asset->name, $headers);
    }

    public function thumbnail(string $token, Asset $asset): Response
    {
        $project = $this->projectFor($token);

        abort_unless($asset->project_id === $project->id, 403);
        abort_unless((bool) $asset->thumbnail_path, 404);

        $disk = Storage::disk($asset->disk);

        abort_unless($disk->exists($asset->thumbnail_path), 404);

        return $disk->response($asset->thumbnail_path);
    }

    protected function projectFor(string $token): Project
    {
        $grant = RenderAccessToken::resolve($token);

        abort_if($grant === null, 404);

        return Project::with('assets')->findOrFail($grant['project_id']);
    }
}
