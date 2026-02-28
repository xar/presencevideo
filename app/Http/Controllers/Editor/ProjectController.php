<?php

namespace App\Http\Controllers\Editor;

use App\Http\Controllers\Controller;
use App\Http\Requests\Editor\StoreProjectRequest;
use App\Http\Requests\Editor\UpdateProjectRequest;
use App\Models\Project;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ProjectController extends Controller
{
    /**
     * Display a listing of the user's projects.
     */
    public function index(Request $request): Response
    {
        $projects = $request->user()
            ->projects()
            ->orderByDesc('updated_at')
            ->get();

        return Inertia::render('editor/Index', [
            'projects' => $projects,
        ]);
    }

    /**
     * Store a newly created project.
     */
    public function store(StoreProjectRequest $request): RedirectResponse
    {
        $project = $request->user()->projects()->create($request->validated());

        return to_route('editor.projects.show', $project);
    }

    /**
     * Display the project editor.
     */
    public function show(Request $request, Project $project): Response
    {
        $this->authorize('view', $project);

        $project->load(['assets']);

        return Inertia::render('editor/Show', [
            'project' => $project,
            'activeGenerations' => $project->generations()
                ->whereIn('status', ['pending', 'processing'])
                ->orderByDesc('created_at')
                ->get(),
        ]);
    }

    /**
     * Update the specified project.
     */
    public function update(UpdateProjectRequest $request, Project $project): RedirectResponse
    {
        $this->authorize('update', $project);

        $project->update($request->validated());

        return back();
    }

    /**
     * Remove the specified project.
     */
    public function destroy(Request $request, Project $project): RedirectResponse
    {
        $this->authorize('delete', $project);

        $project->delete();

        return to_route('editor.index');
    }
}
