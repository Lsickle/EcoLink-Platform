<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd (branch_locations) -- Fase 4 "Cita de Recepción en Planta"
// (D-PRG-02/D-RCP-08). El DDL completo del skill documenta `branch_locations`
// como el futuro catálogo de canvas 2D de áreas de almacenamiento
// (coordinate_x/y, canvas_width/height, max_capacity, risk_level,
// requires_ppe, location_type, parent_location_id) -- decisión EXPLÍCITA de
// esta tarea: NO se construye esa feature aquí (es un caso de uso separado,
// diferido, con react-konva, aún no construido). Se construye SOLO el
// subconjunto MÍNIMO viable necesario para modelar un "muelle" de recepción
// (`plant_reception_schedules.dock_location_id`, `vehicle_checkins.dock_location_id`):
// `id, uuid, tenant_organization_id, branch_id, code, name, is_active,
// timestamps, deleted_at`. Cuando la feature de canvas de almacenamiento se
// construya, esta tabla se ampliará con las columnas restantes (misma tabla,
// no una nueva) -- confirmado por el propio DDL del skill ("branch_locations
// (construir ACOTADO a 'muelles'...)").
//
// Sin `organization_id` propia (a diferencia del DDL completo del skill,
// que sí la tiene) -- se deriva siempre de `branch_id.organization_id`, sin
// necesidad de una columna redundante (mismo criterio que otras tablas de
// este proyecto que solo llevan `branch_id` cuando la organización es
// inequívocamente derivable, ej. `manifest_loads.generator_branch_id`).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('branch_locations', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('tenant_organization_id')->nullable()->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('branch_id')->constrained('branches')->cascadeOnDelete();
            $table->string('code', 50);
            $table->string('name', 150);
            $table->boolean('is_active')->default(true);
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
        });

        // Único POR SEDE (no global) -- una sede puede tener "Muelle 1" y
        // otra sede, de otra organización, también un "Muelle 1". Índice
        // parcial (excluye soft-deletes), mismo patrón que
        // `vehicles.plate_number`/`.vin`/`.code`.
        DB::statement(
            'CREATE UNIQUE INDEX branch_locations_branch_code_unique '.
            'ON branch_locations (branch_id, code) '.
            'WHERE deleted_at IS NULL'
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('branch_locations');
    }
};
