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
        Schema::table('brand_kits', function (Blueprint $table) {
            $table->string('website_url')->nullable()->after('name');
            $table->uuid('intake_token')->nullable()->unique()->after('tone');
            $table->timestamp('intake_token_expires_at')->nullable()->after('intake_token');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('brand_kits', function (Blueprint $table) {
            $table->dropUnique(['intake_token']);
            $table->dropColumn(['website_url', 'intake_token', 'intake_token_expires_at']);
        });
    }
};
