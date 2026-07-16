<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd: vehicles (RN-VEH-001 a RN-VEH-008, CU-051.1/.2/.3/.4). Único
// cambio confirmado sobre el DDL de esquema-bd: `vehicle_type_id` FK real al
// catálogo `vehicle_types` en vez del `vehicle_type VARCHAR(50)` que
// documenta el borrador -- decisión ya confirmada con el usuario (coincide
// con el selector del wireframe CU-051.1, no texto libre).
//
// Sin restricción de business_role para poseer vehículos (decisión ya
// confirmada, desviación deliberada de RN-090 tal como está escrita hoy):
// CUALQUIER organización puede tener vehículos.
//
// `organization_id` usa restrictOnDelete() (mismo criterio "sin ON DELETE
// SET NULL real necesario aquí" ya aplicado a branch_type_id en
// `branches`), `branch_id` nullOnDelete(), `vehicle_type_id`
// restrictOnDelete(), `created_by`/`updated_by` nullOnDelete().
//
// SIN `tenant_organization_id` (hallazgo Medio, especialista-seguridad
// 2026-07-16): el DDL de esquema-bd la incluye, pero ningún código del
// módulo la lee ni la escribe -- el aislamiento real usa `organization_id`
// (mismo criterio ya establecido en `branches`, que tampoco tiene esta
// columna). Se omite deliberadamente para no dejar una columna huérfana que
// un futuro desarrollo pudiera confundir con el campo real de tenant.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vehicles', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('organization_id')->constrained('organizations')->restrictOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
            $table->string('code', 50)->nullable();
            $table->string('plate_number', 20);
            $table->string('vin', 100)->nullable();
            $table->foreignId('vehicle_type_id')->constrained('vehicle_types')->restrictOnDelete();
            $table->string('brand', 100)->nullable();
            $table->string('model', 100)->nullable();
            $table->integer('manufacturing_year')->nullable();
            $table->decimal('max_load_capacity', 12, 2)->nullable()->default(0);
            $table->string('capacity_unit', 20)->default('KG');
            $table->boolean('supports_hazmat')->default(false);
            $table->boolean('has_gps')->default(false);
            // Lista cerrada de texto, no catálogo FK (sin wireframe exacto
            // que exija normalizar aún): ACTIVE / OUT_OF_SERVICE / mismo
            // criterio de `branches.status`.
            $table->string('operational_status', 30)->default('ACTIVE');
            $table->date('soat_expiration_date')->nullable();
            $table->date('technical_inspection_expiration')->nullable();
            $table->boolean('is_active')->default(true);
            $table->jsonb('metadata')->nullable()->default(DB::raw("'{}'::jsonb"));
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
        });

        // Unicidad real en BD para plate_number/vin/code, con índices únicos
        // PARCIALES (excluyen soft-deletes) -- mismo mecanismo exacto ya
        // establecido para `organizations.tax_id`/`branches.code`
        // (`WHERE deleted_at IS NULL`), consistente en vez de un UNIQUE
        // plano que bloquearía reutilizar el valor tras un soft-delete.
        // `vin`/`code` además excluyen NULL explícitamente (múltiples filas
        // NULL son válidas, un UNIQUE parcial de Postgres ya las ignora por
        // defecto, pero se deja explícito por claridad).
        DB::statement(
            'CREATE UNIQUE INDEX vehicles_plate_number_unique ON vehicles (plate_number) WHERE deleted_at IS NULL'
        );
        DB::statement(
            'CREATE UNIQUE INDEX vehicles_vin_unique ON vehicles (vin) WHERE deleted_at IS NULL AND vin IS NOT NULL'
        );
        DB::statement(
            'CREATE UNIQUE INDEX vehicles_code_unique ON vehicles (code) WHERE deleted_at IS NULL AND code IS NOT NULL'
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('vehicles');
    }
};
