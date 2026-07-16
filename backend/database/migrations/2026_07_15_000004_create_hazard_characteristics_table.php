<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd, item 14 (Módulo Residuos y Corrientes, D-R04 revisado
// 2026-07-05): catálogo global "Características de Peligrosidad" para
// multi-select real sobre `wastes` (vía pivote `waste_hazard_characteristics`,
// NO construida en este lote -- ver database/seeders/HazardCharacteristicSeeder.php
// para el detalle de `risk_level` y el esquema de `code` elegido). Solo
// ADMINISTRADOR gestiona el catálogo -- 100% global, sin
// tenant_organization_id, mismo patrón que `branch_types`.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hazard_characteristics', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->string('code')->unique();
            $table->string('name')->unique();
            $table->integer('risk_level');
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
        Schema::dropIfExists('hazard_characteristics');
    }
};
