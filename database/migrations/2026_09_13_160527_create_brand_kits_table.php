<?php

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
        Schema::create('brand_kits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->json('colors');
            $table->json('fonts');
            $table->json('logos');
            $table->json('watermark')->nullable();
            $table->foreignId('intro_asset_id')->nullable()->constrained('assets')->nullOnDelete();
            $table->foreignId('outro_asset_id')->nullable()->constrained('assets')->nullOnDelete();
            $table->json('voice')->nullable();
            $table->json('music')->nullable();
            $table->string('caption_preset')->nullable();
            $table->string('motion_preset')->nullable();
            $table->text('tone')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('brand_kits');
    }
};
