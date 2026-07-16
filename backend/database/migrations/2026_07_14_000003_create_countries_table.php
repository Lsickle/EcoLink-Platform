<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd (D-P01, geografía en cascada): countries. Catálogo de solo
// lectura -- sin `deleted_at`, mismo patrón que `user_statuses`. El esquema
// completo de esquema-bd define `iso_code VARCHAR(3)`, pero este lote (plan
// aprobado del hilo principal) recorta a `VARCHAR(2)` (ISO 3166-1 alpha-2,
// suficiente para el subconjunto de prueba sembrado).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('countries', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->string('iso_code', 2)->unique();
            $table->string('name')->unique();
            $table->boolean('is_active')->default(true);
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('countries');
    }
};
