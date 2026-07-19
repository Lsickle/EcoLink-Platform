<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd (Módulo Solicitudes de Servicio, cabecera): waste_service_requests
// -- solicitud operativa de recolección/disposición, creada por el
// Generador. `organization_id` es SIEMPRE el Generador dueño de la
// solicitud; el/los Gestor(es) destino se fijan POR ÍTEM
// (`waste_service_request_items.waste_treatment_approval_id`, D-S01) -- una
// misma solicitud puede tener ítems dirigidos a Gestores distintos, por eso
// esta cabecera NO tiene columna "Gestor destino".
//
// `tenant_organization_id`/`organization_id` -- mismo patrón exacto que
// `wastes` (entidad de negocio central, no un catálogo/sede simple):
// `tenant_organization_id` nullable + cascadeOnDelete (aislamiento
// multi-tenant), `organization_id` NOT NULL + cascadeOnDelete (dueño real,
// el Generador -- esquema-bd documenta CASCADE para esta FK, a diferencia de
// `wastes.organization_id` que es RESTRICT; se sigue la regla ON DELETE
// documentada específicamente para esta tabla).
//
// `service_status_id` (D-S02): reemplaza el `workflow_status` VARCHAR
// original -- FK a `service_statuses`, RESTRICT (un estado en uso no puede
// borrarse).
//
// `measurement_unit_id` (D-S11, renombrado desde `volume_unit` VARCHAR):
// reutiliza el catálogo `measurement_units` ya normalizado en Residuos, en
// vez de una lista de texto libre propia de este módulo.
//
// `requested_by`/`created_by`/`updated_by` (D-S08): `requested_by` (quién
// SOLICITA el servicio) es conceptualmente distinto de `created_by` (quién
// CREÓ el registro -- podría ser un agente de servicio al cliente actuando
// en nombre del solicitante). D-S08 deja EXPLÍCITAMENTE pendiente de
// precisar si `requested_by` debe apuntar a `users` o a un futuro catálogo
// de "contactos sin cuenta" -- se elige `users` aquí (el mismo tipo que
// `created_by`/`updated_by`) por ser la interpretación más simple y menos
// arriesgada mientras esa precisión no llega; señalado explícitamente en el
// resumen de la tarea, no una reinterpretación silenciosa.
//
// `cancellation_reason_id`/`cancellation_details`/`cancelled_by`/
// `cancelled_at` (D-S09): columnas dedicadas para RN-SOL-009, reemplazan el
// enfoque anterior en `metadata` JSONB.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('waste_service_requests', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('tenant_organization_id')->nullable()->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('branch_id')->constrained('branches')->restrictOnDelete();
            $table->string('request_code', 50)->unique();
            $table->foreignId('service_status_id')->constrained('service_statuses')->restrictOnDelete();
            $table->timestampTz('requested_at')->useCurrent();
            $table->date('requested_collection_date')->nullable();
            $table->date('estimated_ready_date')->nullable();
            $table->timestampTz('scheduled_collection_date')->nullable();
            $table->decimal('estimated_total_weight', 14, 2)->nullable();
            $table->decimal('estimated_total_volume', 14, 2)->nullable();
            // D-S11: reemplaza `volume_unit` VARCHAR -- reutiliza measurement_units.
            $table->foreignId('measurement_unit_id')->nullable()->constrained('measurement_units')->restrictOnDelete();
            // No confirmado como FK por ningún D-S (D-S11 solo confirma
            // physical_state/measurement_unit) -- se mantiene texto libre.
            $table->string('packaging_type', 100)->nullable();
            $table->boolean('requires_lift_platform')->default(false);
            $table->boolean('requires_audit')->default(false);
            $table->boolean('requires_photo_record')->default(false);
            $table->boolean('requires_container_return')->default(false);
            $table->decimal('estimated_height', 10, 2)->nullable();
            $table->decimal('estimated_width', 10, 2)->nullable();
            $table->decimal('estimated_length', 10, 2)->nullable();
            $table->text('observations')->nullable();
            $table->string('request_source', 30)->default('PORTAL');
            $table->string('priority', 20)->default('NORMAL');
            // D-S08: distinto de created_by -- ver docblock arriba.
            $table->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            // D-S09.
            $table->foreignId('cancellation_reason_id')->nullable()->constrained('cancellation_reasons')->restrictOnDelete();
            $table->text('cancellation_details')->nullable();
            $table->foreignId('cancelled_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampTz('cancelled_at')->nullable();
            $table->boolean('is_active')->default(true);
            $table->jsonb('metadata')->nullable()->default(DB::raw("'{}'::jsonb"));
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();
            // D-S08: auditoría estándar, no existía en el diseño original.
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('waste_service_requests');
    }
};
