<?php

use App\Http\Controllers\Editor\AssetController;
use App\Http\Controllers\Editor\AssetStreamController;
use App\Http\Controllers\Editor\BrandKitController;
use App\Http\Controllers\Editor\BrandKitIntakeController;
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

    // Brand kits
    Route::get('/brand-kits', [BrandKitController::class, 'index'])->name('editor.brand-kits.index');
    Route::post('/brand-kits', [BrandKitController::class, 'store'])->name('editor.brand-kits.store');
    Route::put('/brand-kits/{brandKit}', [BrandKitController::class, 'update'])->name('editor.brand-kits.update');
    Route::delete('/brand-kits/{brandKit}', [BrandKitController::class, 'destroy'])->name('editor.brand-kits.destroy');
    Route::post('/brand-kits/intake-link', [BrandKitController::class, 'intakeLink'])->name('editor.brand-kits.intake-link');
    Route::delete('/brand-kits/{brandKit}/intake-link', [BrandKitController::class, 'revokeIntakeLink'])->name('editor.brand-kits.intake-link.revoke');

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
/*
 * Brand kit intake surface.
 *
 * Deliberately outside the auth guard: the caller is an outside LLM agent with
 * no session, handed one opaque capability by the kit's owner
 * (BrandKit::issueIntakeToken). The token names the single kit it may write,
 * expires on its own, and every field it sets is validated by the same rules
 * the authenticated editor uses. Never widen the ordinary brand kit routes
 * instead. Throttled because the token is the only thing standing in front of
 * it and the upload endpoint does outbound work.
 */
Route::prefix('brand-intake')->middleware('throttle:60,1')->group(function () {
    Route::get('/{token}', [BrandKitIntakeController::class, 'show'])->name('brand-intake.show');
    Route::match(['patch', 'post'], '/{token}', [BrandKitIntakeController::class, 'update'])->name('brand-intake.update');
    Route::post('/{token}/assets', [BrandKitIntakeController::class, 'storeAsset'])->name('brand-intake.assets.store');
});

Route::prefix('editor/headless')->group(function () {
    Route::get('/{token}/page', [HeadlessRenderController::class, 'page'])->name('editor.headless.page');
    Route::get('/{token}/assets/{asset}', [HeadlessRenderController::class, 'asset'])->name('editor.headless.asset');
    Route::get('/{token}/assets/{asset}/thumbnail', [HeadlessRenderController::class, 'thumbnail'])->name('editor.headless.thumbnail');
});
