<?php

use App\Http\Controllers\Editor\AssetController;
use App\Http\Controllers\Editor\GenerationController;
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
    Route::delete('/assets/{asset}', [AssetController::class, 'destroy'])->name('editor.assets.destroy');

    // Generation
    Route::post('/projects/{project}/generate/{type}', [GenerationController::class, 'store'])
        ->name('editor.generations.store')
        ->where('type', 'text_to_image|image_to_video|text_to_music|text_to_speech|text_to_sfx');
    Route::get('/generations/{generation}', [GenerationController::class, 'show'])->name('editor.generations.show');

    // Render
    Route::post('/projects/{project}/render', [RenderController::class, 'store'])->name('editor.renders.store');
    Route::get('/renders/{render}', [RenderController::class, 'show'])->name('editor.renders.show');
    Route::get('/renders/{render}/download', [RenderController::class, 'download'])->name('editor.renders.download');
});
