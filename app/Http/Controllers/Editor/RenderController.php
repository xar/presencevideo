<?php

namespace App\Http\Controllers\Editor;

use App\Enums\RenderStatus;
use App\Http\Controllers\Controller;
use App\Jobs\RenderProject;
use App\Models\Project;
use App\Models\Render;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class RenderController extends Controller
{
    /**
     * Start a new render.
     */
    public function store(Request $request, Project $project): JsonResponse
    {
        $this->authorize('update', $project);

        $render = Render::create([
            'project_id' => $project->id,
            'user_id' => $request->user()->id,
            'status' => RenderStatus::Queued,
            'progress' => 0,
        ]);

        RenderProject::dispatch($render);

        return response()->json([
            'render' => $render,
        ], 201);
    }

    /**
     * Get the status of a render.
     */
    public function show(Request $request, Render $render): JsonResponse
    {
        $this->authorize('view', $render);

        return response()->json([
            'render' => $render,
        ]);
    }

    /**
     * Download the rendered video.
     */
    public function download(Request $request, Render $render): StreamedResponse
    {
        $this->authorize('view', $render);

        if (! $render->isComplete() || ! $render->output_path) {
            abort(404, 'Render not available for download.');
        }

        return Storage::download(
            $render->output_path,
            $render->project->name.'.mp4',
            ['Content-Type' => 'video/mp4']
        );
    }
}
