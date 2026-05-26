<?php

use App\Http\Controllers\Agent\ChatController;
use App\Http\Controllers\Seo\BlogController;
use App\Http\Controllers\Seo\ProgrammaticPageController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;
use Laravel\Fortify\Features;

Route::get('/', function () {
    return Inertia::render('Welcome', [
        'canRegister' => Features::enabled(Features::registration()),
    ]);
})->name('home');

Route::redirect('dashboard', '/editor')->name('dashboard');

Route::middleware('cache.headers:public;max_age=300;s_maxage=3600;stale_while_revalidate=86400;etag')->group(function () {
    Route::get('blog', [BlogController::class, 'index'])->name('seo.blog.index');
    Route::get('blog/{slug}', [BlogController::class, 'show'])->name('seo.blog.show');
    Route::get('use-cases/{slug}', [ProgrammaticPageController::class, 'show'])->name('seo.pages.show');
});

Route::middleware(['auth', 'verified'])->prefix('agent')->name('agent.chat.')->group(function () {
    Route::get('/', [ChatController::class, 'index'])->name('index');
    Route::get('/conversations/latest', [ChatController::class, 'latest'])->name('latest');
    Route::get('/conversations/{conversation}', [ChatController::class, 'index'])->name('show');
    Route::post('/messages', [ChatController::class, 'store'])->name('store');
    Route::post('/messages/prepare', [ChatController::class, 'prepare'])->name('prepare');
    Route::post('/messages/broadcast', [ChatController::class, 'broadcast'])->name('broadcast');
    Route::post('/messages/stream', [ChatController::class, 'stream'])->name('stream');
});

require __DIR__.'/settings.php';
require __DIR__.'/editor.php';
