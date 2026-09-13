<?php

use App\Http\Controllers\Editor\AssetController;
use App\Http\Controllers\Editor\AssetStreamController;
use App\Http\Controllers\Editor\GenerationController;
use App\Http\Controllers\Editor\HeadlessRenderController;
use App\Http\Controllers\Editor\ProjectController;
use App\Http\Controllers\Editor\RenderController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth', 'verified'])->prefix('editor')->group(function () {
    // Projects
    Route::get('/', [ProjectController::class, 'index'])->name('editor.index');
    Route::post('/projects', [ProjectController::class, 'store'])->name('editor.projects.store');
    Route::get('/projects/{project}', [ProjectController::class, 'show'])->name('editor.projects.show');
    Route::put('/projects/{project}', [ProjectController::class, 'update'])->name('editor.projects.update');
    Route::delete('/projects/{project}', [ProjectController::class, 'destroy'])->name('editor.projects.destroy');

    // Assets
    Route::post('/projects/{project}/assets', [AssetController::class, 'store'])->name('editor.assets.store');
    Route::get('/assets/{asset}/stream', [AssetStreamController::class, 'show'])->name('editor.assets.stream');
    Route::get('/assets/{asset}/thumbnail', [AssetStreamController::class, 'thumbnail'])->name('editor.assets.thumbnail');
    Route::delete('/assets/{asset}', [AssetController::class, 'destroy'])->name('editor.assets.destroy');

    // Generation
    Route::get('/generations/models', [GenerationController::class, 'models'])->name('editor.generations.models');
    Route::get('/generations/catalog', [GenerationController::class, 'searchCatalog'])->name('editor.generations.catalog');
    Route::get('/generations/catalog/model', [GenerationController::class, 'getCatalogModel'])->name('editor.generations.catalog.model');
    Route::post('/projects/{project}/generate/{type}', [GenerationController::class, 'store'])
        ->name('editor.generations.store')
        ->where('type', 'text_to_image|image_to_video|text_to_video|text_to_music|text_to_speech|text_to_sfx|speech_to_text');
    Route::get('/generations/{generation}', [GenerationController::class, 'show'])->name('editor.generations.show');

    // Render
    Route::post('/projects/{project}/render', [RenderController::class, 'store'])->name('editor.renders.store');
    Route::get('/renders/{render}', [RenderController::class, 'show'])->name('editor.renders.show');
    Route::get('/renders/{render}/download', [RenderController::class, 'download'])->name('editor.renders.download');
});

/*
 * Headless render surface.
 *
 * Deliberately outside the auth guard: the browser that renders these pages has
 * no session. Access is granted instead by a short-lived, single-project token
 * (App\Services\HeadlessRender\RenderAccessToken) that the render job mints and
 * revokes, and every route re-checks that the asset belongs to that project.
 */
Route::prefix('editor/headless')->group(function () {
    Route::get('/{token}/page', [HeadlessRenderController::class, 'page'])->name('editor.headless.page');
    Route::get('/{token}/assets/{asset}', [HeadlessRenderController::class, 'asset'])->name('editor.headless.asset');
    Route::get('/{token}/assets/{asset}/thumbnail', [HeadlessRenderController::class, 'thumbnail'])->name('editor.headless.thumbnail');
});
