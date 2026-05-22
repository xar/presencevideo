<?php

use App\Http\Controllers\Agent\ChatController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;
use Laravel\Fortify\Features;

Route::get('/', function () {
    return Inertia::render('Welcome', [
        'canRegister' => Features::enabled(Features::registration()),
    ]);
})->name('home');

Route::redirect('dashboard', '/editor')->name('dashboard');

Route::middleware(['auth', 'verified'])->prefix('agent')->name('agent.chat.')->group(function () {
    Route::get('/', [ChatController::class, 'index'])->name('index');
    Route::get('/conversations/latest', [ChatController::class, 'latest'])->name('latest');
    Route::get('/conversations/{conversation}', [ChatController::class, 'index'])->name('show');
    Route::post('/messages', [ChatController::class, 'store'])->name('store');
    Route::post('/messages/stream', [ChatController::class, 'stream'])->name('stream');
});

require __DIR__.'/settings.php';
require __DIR__.'/editor.php';
