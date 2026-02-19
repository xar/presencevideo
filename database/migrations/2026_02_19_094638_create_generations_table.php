<?php

use App\Enums\GenerationStatus;
use App\Enums\GenerationType;
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
        Schema::create('generations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->uuid('scene_id')->nullable();
            $table->unsignedInteger('step_index')->nullable();
            $table->string('type');
            $table->string('provider')->default('fal');
            $table->string('model');
            $table->text('prompt');
            $table->foreignId('input_asset_id')->nullable()->constrained('assets')->nullOnDelete();
            $table->foreignId('output_asset_id')->nullable()->constrained('assets')->nullOnDelete();
            $table->jsonb('parameters')->default('{}');
            $table->string('status')->default(GenerationStatus::Pending->value);
            $table->text('error_message')->nullable();
            $table->string('fal_request_id')->nullable();
            $table->jsonb('alternatives')->default('[]');
            $table->timestamps();

            $table->index(['project_id', 'scene_id']);
            $table->index(['user_id', 'status']);
            $table->index('fal_request_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('generations');
    }
};
