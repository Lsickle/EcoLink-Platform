<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd: organization_statuses (catálogo de estados de organización).
// Sin seed de valores en esquema-bd todavía (pendiente de confirmar contra
// la fuente de catálogos) — esta migración solo crea la estructura.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('organization_statuses', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->string('code', 50)->unique();
            $table->string('name', 100)->unique();
            $table->text('description')->nullable();
            $table->integer('sort_order')->default(1);
            $table->boolean('is_initial')->default(false);
            $table->boolean('is_final')->default(false);
            $table->boolean('allows_operation')->default(false);
            $table->boolean('requires_document_validation')->default(false);
            $table->boolean('requires_commercial_approval')->default(false);
            $table->boolean('is_suspended')->default(false);
            $table->string('color_hex', 7)->nullable();
            $table->string('icon', 100)->nullable();
            $table->boolean('is_active')->default(true);
            $table->jsonb('metadata')->nullable()->default(DB::raw("'{}'::jsonb"));
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('organization_statuses');
    }
};
