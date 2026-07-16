<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// ============================================================================
// AVISO -- DATOS PROVISIONALES, SIN FUENTE DE NEGOCIO CONFIRMADA
// ============================================================================
// Catálogo Maestro "Estados del Embalaje" -- Batch 3/3 (último) de Catálogos
// Maestros. A diferencia de `packaging_types` (datos reales confirmados) y
// de los catálogos de los Batches 1/2, este catálogo NO tiene ningún archivo
// fuente ni regla de negocio (RN-XXX) detrás. El usuario confirmó
// explícitamente sembrarlo con los 3 valores de ejemplo del mockup de Figma
// (frame `877:10997`), marcados como provisionales -- ver AVISO
// correspondiente en database/seeders/PackagingConditionSeeder.php. Esta
// estructura (y sus datos) están PENDIENTES DE VALIDACIÓN REAL DE NEGOCIO,
// mismo criterio que el aviso ya usado en `BranchTypeSeeder.php` sobre sus
// flags de capacidad.
// ============================================================================
//
// Mismo patrón estructural EXACTO que hazard_characteristics (Batch 2/3): 100%
// global, sin tenant_organization_id/created_by/updated_by. Solo
// ADMINISTRADOR gestiona el catálogo. `risk_level` (INTEGER, NULL-able)
// reutiliza el mismo criterio de "mayor = más peligroso" ya usado en
// hazard_characteristics.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('packaging_conditions', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->string('code')->unique();
            $table->string('name')->unique();
            $table->integer('risk_level')->nullable();
            $table->boolean('is_system')->default(true);
            $table->boolean('is_active')->default(true);
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('packaging_conditions');
    }
};
