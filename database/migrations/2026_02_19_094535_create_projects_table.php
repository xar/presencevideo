<?php

use App\Enums\ProjectStatus;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('projects', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->unsignedInteger('resolution_width')->default(1080);
            $table->unsignedInteger('resolution_height')->default(1920);
            $table->unsignedInteger('fps')->default(30);
            $table->jsonb('scenes')->default('[]');
            $table->jsonb('audio_tracks')->default('[]');
            $table->string('status')->default(ProjectStatus::Draft->value);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('projects');
    }
};
