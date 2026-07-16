<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Catálogo Maestro "Tipos de Embalaje" -- Batch 3/3 (último) de Catálogos
// Maestros. Datos REALES confirmados (ver
// database/seeders/data_packaging_types.json, 29 filas, id/name) --
// distinto de los 2 catálogos hermanos de este mismo lote
// (packaging_conditions/vehicle_types), que son PROVISIONALES (ver AVISO en
// sus propias migraciones). Mismo patrón EXACTO que
// hazard_characteristics/waste_categories/physical_states (Batch 2/3): 100%
// global, sin tenant_organization_id/created_by/updated_by. Solo
// ADMINISTRADOR gestiona el catálogo.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('packaging_types', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->string('code')->unique();
            $table->string('name')->unique();
            $table->boolean('is_system')->default(true);
            $table->boolean('is_active')->default(true);
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('packaging_types');
    }
};
