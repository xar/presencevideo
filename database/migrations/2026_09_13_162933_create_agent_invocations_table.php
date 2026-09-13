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
        Schema::create('agent_invocations', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('conversation_id', 36);
            $table->foreignId('user_id')->index();
            $table->string('status', 20)->default('queued');
            $table->text('prompt');
            $table->longText('partial_text')->nullable();
            $table->unsignedInteger('last_seq')->default(0);
            $table->text('error_message')->nullable();
            $table->string('idempotency_key', 64)->nullable();
            $table->timestamp('heartbeat_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();

            $table->index(['conversation_id', 'created_at']);
            $table->index(['status', 'heartbeat_at']);
            $table->unique(['user_id', 'idempotency_key']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('agent_invocations');
    }
};
