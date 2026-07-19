<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd (Módulo Solicitudes de Servicio, detalle):
// waste_service_request_items -- detalle de residuos de una
// `waste_service_request`. `waste_treatment_approval_id` (D-S01) fija, POR
// ÍTEM, cuál evaluación/Gestor aplica -- una misma solicitud puede tener
// ítems dirigidos a Gestores distintos, la cabecera NO tiene "Gestor
// destino" propio.
//
// `waste_treatment_approval_id` NULLABLE (D-S06): nullable en Borrador,
// obligatorio al transicionar a Enviada (regla de APLICACIÓN, no de
// esquema) -- mismo patrón que otros campos "nullable en Draft" de este
// módulo (D-S07).
//
// `item_status_id` (D-S10): reemplaza el `item_status` VARCHAR original --
// FK a `service_item_statuses` (catálogo SEPARADO, viabilidad de
// recolección del ítem, NO el mismo catálogo que la cabecera).
//
// `physical_state_id`/`measurement_unit_id` (D-S11): reemplazan
// `physical_state`/`weight_unit` VARCHAR -- reutilizan los catálogos ya
// normalizados en Residuos (`physical_states`/`measurement_units`, con
// `measurement_units` ampliado con LB, ya sembrado por MeasurementUnitSeeder).
//
// `is_stackable` (nomenclatura, plan de migración issue S-43): renombrado
// desde `stackable` -- rompía el patrón `is_`/`requires_`/`has_` del resto
// de columnas booleanas de esta tabla y del esquema en general.
//
// `service_request_id` (nombre de columna, NO `waste_service_request_id`):
// `02-arquitecto-datos.md` señala la inconsistencia de nombre con
// `transport_schedules.waste_service_request_id` (misma FK destino, dos
// nombres), pero la unificación queda EXPLÍCITAMENTE como "decisión humana
// pendiente" en `09-plan-migracion.md` (issue S-42, sin resolver) -- se
// mantiene `service_request_id` tal cual, sin renombrar unilateralmente.
//
// `created_by`/`updated_by` NO se agregan a esta tabla -- a diferencia de la
// cabecera (D-S08, sí resuelta), la ausencia de auditoría estándar en los
// ítems (hallazgo #3 de `02-arquitecto-datos.md`, "Requiere validación") NO
// tiene una decisión D-S que la resuelva explícitamente; no se inventa.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('waste_service_request_items', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('tenant_organization_id')->nullable()->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('service_request_id')->constrained('waste_service_requests')->cascadeOnDelete();
            $table->integer('item_sequence')->default(1);
            $table->foreignId('waste_id')->constrained('wastes')->restrictOnDelete();
            // D-S01/D-S06: nullable en Borrador, obligatorio al Enviar (aplicación).
            $table->foreignId('waste_treatment_approval_id')->nullable()->constrained('waste_treatment_approvals')->restrictOnDelete();
            $table->string('waste_name_snapshot', 255);
            $table->string('waste_code_snapshot', 100)->nullable();
            $table->string('treatment_snapshot', 255)->nullable();
            $table->decimal('estimated_quantity', 14, 2)->nullable();
            $table->decimal('actual_quantity', 14, 2)->nullable();
            $table->decimal('estimated_weight', 14, 2)->nullable();
            $table->decimal('actual_weight', 14, 2)->nullable();
            // D-S11: reemplaza `weight_unit` VARCHAR.
            $table->foreignId('measurement_unit_id')->nullable()->constrained('measurement_units')->restrictOnDelete();
            // No confirmado como FK por D-S11 (solo confirma physical_state y
            // measurement_unit) -- se mantiene texto libre.
            $table->string('packaging_type', 100)->nullable();
            // D-S11: reemplaza `physical_state` VARCHAR.
            $table->foreignId('physical_state_id')->nullable()->constrained('physical_states')->nullOnDelete();
            // Renombrado desde `stackable` (S-43).
            $table->boolean('is_stackable')->default(false);
            $table->boolean('requires_forklift')->default(false);
            $table->boolean('requires_isolation')->default(false);
            $table->decimal('height', 10, 2)->nullable();
            $table->decimal('width', 10, 2)->nullable();
            $table->decimal('length', 10, 2)->nullable();
            $table->decimal('calculated_volume', 14, 3)->nullable();
            // D-S10: reemplaza `item_status` VARCHAR -- catálogo SEPARADO de
            // service_statuses (viabilidad de recolección del ítem).
            $table->foreignId('item_status_id')->nullable()->constrained('service_item_statuses')->restrictOnDelete();
            $table->text('observations')->nullable();
            $table->boolean('is_active')->default(true);
            $table->jsonb('metadata')->nullable()->default(DB::raw("'{}'::jsonb"));
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('waste_service_request_items');
    }
};
