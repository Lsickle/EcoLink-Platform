<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// ============================================================================
// AVISO -- DATOS PROVISIONALES, SIN FUENTE DE NEGOCIO CONFIRMADA
// ============================================================================
// Catálogo Maestro "Tipos de Vehículo" -- Batch 3/3 (último) de Catálogos
// Maestros. Igual que `packaging_conditions`, este catálogo NO tiene ningún
// archivo fuente ni regla de negocio (RN-XXX) detrás. El usuario confirmó
// explícitamente sembrarlo con los 4 valores de ejemplo del mockup de Figma
// (frame `881:11199`), marcados como provisionales -- ver AVISO
// correspondiente en database/seeders/VehicleTypeSeeder.php. Esta estructura
// (y sus datos) están PENDIENTES DE VALIDACIÓN REAL DE NEGOCIO, mismo
// criterio que el aviso ya usado en `BranchTypeSeeder.php` sobre sus flags
// de capacidad.
//
// IMPORTANTE: este catálogo es solo una tabla de referencia AISLADA. NO se
// toca la tabla `vehicles` existente ni su columna `vehicle_type` VARCHAR
// (esquema-bd) -- el módulo Vehículos no está construido todavía. El mock de
// Figma mostraba columnas adicionales (capacidad, RESPEL, líquidos) que NO
// tienen fuente de dato real y NO se agregan aquí -- solo `category` (texto
// libre, visto en el mock) queda incluido, sin inventar más campos.
// ============================================================================
//
// Mismo patrón estructural EXACTO que hazard_characteristics/waste_categories
// (Batch 2/3): 100% global, sin tenant_organization_id/created_by/updated_by.
// Solo ADMINISTRADOR gestiona el catálogo.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vehicle_types', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->string('code')->unique();
            $table->string('name')->unique();
            $table->string('category')->nullable();
            $table->boolean('is_system')->default(true);
            $table->boolean('is_active')->default(true);
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vehicle_types');
    }
};
