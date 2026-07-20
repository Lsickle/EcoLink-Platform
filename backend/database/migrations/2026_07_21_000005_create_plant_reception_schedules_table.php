<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd (plant_reception_schedules, D-PRG-02) -- Fase 4 "Cita de
// Recepción en Planta (bilateral)": coordinación de franja horaria + muelle
// entre quien transporta (Gestor/Transportador, o el Generador en
// autotransporte) y la planta receptora (Gestor), MEDIANTE
// PROPUESTA/CONTRAPROPUESTA -- no una asignación directa.
//
// `unload_request_id` FK RESTRICT -- solo sobre solicitudes en estado
// Aprobada (RN-RCP-015), invariante impuesta en la capa de aplicación
// (`PlantReceptionScheduleService::propose()`), no expresable como
// constraint de columna (depende del estado vigente de otra tabla).
//
// `status` VARCHAR LIBRE (a propósito, NO FK a un catálogo ni gobernado por
// el motor de Workflow genérico) -- decisión de diseño explícita de esta
// tarea: la franja propuesta/contrapropuesta vive en campos DEDICADOS
// (`proposed_*`/`counter_proposed_*`/`confirmed_*`), y la mecánica de
// propuesta/contrapropuesta/confirmación vive en `PlantReceptionScheduleService`
// (capa de servicio propia), NO en el motor de Workflow -- mismo criterio ya
// usado en `waste_service_requests` (D-S27: el motor no transporta payload
// de negocio). Valores de aplicación: PROPOSED / COUNTER_PROPOSED /
// CONFIRMED / SUPERSEDED (esta última cuando `reschedule()` la reemplaza por
// una fila nueva con `parent_schedule_id` apuntando a esta).
//
// `parent_schedule_id` (historial de reprogramaciones, `reschedule()`
// incrementa `version_number` y crea una fila NUEVA) -- self-reference
// RESTRICT (preserva el historial, mismo criterio que `transport_schedules.parent_schedule_id`).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('plant_reception_schedules', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('tenant_organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('unload_request_id')->constrained('unload_requests')->restrictOnDelete();
            $table->foreignId('receiving_branch_id')->constrained('branches')->restrictOnDelete();
            $table->foreignId('dock_location_id')->nullable()->constrained('branch_locations')->nullOnDelete();
            $table->date('scheduled_date');
            $table->timestampTz('scheduled_start_at');
            $table->timestampTz('scheduled_end_at');
            $table->string('proposed_by_role', 30);
            $table->foreignId('proposed_by_user_id')->constrained('users')->restrictOnDelete();
            $table->timestampTz('proposed_at')->useCurrent();
            $table->date('counter_proposed_date')->nullable();
            $table->timestampTz('counter_proposed_start_at')->nullable();
            $table->timestampTz('counter_proposed_end_at')->nullable();
            $table->foreignId('counter_proposed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampTz('counter_proposed_at')->nullable();
            $table->foreignId('confirmed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampTz('confirmed_at')->nullable();
            $table->string('status', 30)->default('PROPOSED');
            $table->text('reschedule_reason')->nullable();
            $table->text('rejection_reason')->nullable();
            $table->integer('version_number')->default(1);
            $table->foreignId('parent_schedule_id')->nullable()->constrained('plant_reception_schedules')->restrictOnDelete();
            $table->boolean('is_active')->default(true);
            $table->jsonb('metadata')->nullable()->default(DB::raw("'{}'::jsonb"));
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
        });

        // Solo una franja VIGENTE (activa) por unload_request a la vez --
        // `reschedule()` apaga `is_active` de la anterior antes de insertar
        // la nueva, mismo patrón que `manifest_loads_active_unique`.
        DB::statement(
            'CREATE UNIQUE INDEX plant_reception_schedules_active_unique '.
            'ON plant_reception_schedules (unload_request_id) '.
            'WHERE is_active = true AND deleted_at IS NULL'
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('plant_reception_schedules');
    }
};
