<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd: generation_frequencies -- catálogo global "Frecuencia de
// Generación" (DAILY/WEEKLY/MONTHLY/OCCASIONAL). Mismo patrón EXACTO que
// `waste_categories`/`physical_states`/`branch_types`.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('generation_frequencies', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->string('code')->unique();
            $table->string('name');
            $table->text('description')->nullable();
            $table->boolean('is_system')->default(true);
            $table->boolean('is_active')->default(true);
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('generation_frequencies');
    }
};
