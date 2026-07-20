<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd (manifest_loads) + Módulo Manifiesto de Cargue, Fase 3 --
// documento/registro firmado en la planta del Generador ANTES de que el
// vehículo transporte los residuos hacia el Gestor. Gobernado por el motor
// de Workflow genérico (`entity_type=MANIFEST`, ya presente en
// `Workflow::ENTITY_TYPES`, sin cambios de motor).
//
// `manifest_number`: D-MAN-03, único POR ORGANIZACIÓN (no global) --
// `UNIQUE(tenant_organization_id, manifest_number)` en vez de un UNIQUE
// simple, generado server-side (mismo patrón que
// `TransportScheduleController::generateScheduleNumber()`).
//
// `manifest_status_id`: D-MAN-01, catálogo `manifest_statuses` (8 valores).
// `restrictOnDelete()` -- mismo criterio que `transport_schedules.transport_status_id`.
//
// `transport_schedule_id`/`generator_branch_id`/`carrier_organization_id`/
// `vehicle_id`/`transport_personnel_id`: decisión de diseño de ESTA tarea --
// las 4 últimas se DERIVAN automáticamente del `transport_schedule_id`
// vinculado al crear el manifiesto (`ManifestLoadController::store()`), no
// se aceptan independientes en el payload. `generator_branch_id` =
// `transport_schedule.source_branch_id` (confirmado en la migración
// `create_transport_schedules_table`: el origen de la programación ES la
// sede del Generador). `carrier_organization_id` = `transport_schedule.organization_id`
// (la organización que programó el transporte, dueña del vehículo/conductor
// asignados). RN-192 ("todo manifiesto debe tener transportador asignado"):
// ya garantizado por estas 4 columnas NOT NULL derivadas del
// `transport_schedule_id` -- sin guarda adicional necesaria, la integridad
// referencial + la derivación server-side lo cubren.
//
// `generator_signer_person_id`: se elige a mano al crear el manifiesto (una
// `Person` que sea contacto/empleado de la organización Generadora, ver
// `ManifestLoadController::assertPersonBelongsToOrganization()`, adaptado de
// `TransportPersonnelController`). `driver_signer_person_id`: se deriva
// automáticamente de `transport_schedule.transportPersonnel.person_id`. Ambas
// `restrictOnDelete()` -- mismo criterio que preservar evidencia legal de
// quién firmó un documento regulatorio, análogo a por qué `audit_logs`
// preserva referencias de auditoría (RN-158, aunque aquí es a nivel de
// integridad referencial simple, no soft-delete de logs).
//
// Columnas offline (RN-183-187, "esquema listo sin mecanismo de sync
// funcional", confirmado explícitamente para este lote): `sync_status`/
// `device_captured_at`/`offline_integrity_hash` -- sin `synced_at` (no
// solicitado explícitamente para este lote, a diferencia de otras tablas
// offline ya construidas como `vehicle_checkins`).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('manifest_loads', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('tenant_organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->string('manifest_number', 50);
            $table->foreignId('manifest_status_id')->constrained('manifest_statuses')->restrictOnDelete();
            $table->foreignId('transport_schedule_id')->constrained('transport_schedules')->restrictOnDelete();
            $table->foreignId('generator_branch_id')->constrained('branches')->restrictOnDelete();
            $table->foreignId('carrier_organization_id')->constrained('organizations')->restrictOnDelete();
            $table->foreignId('vehicle_id')->constrained('vehicles')->restrictOnDelete();
            $table->foreignId('transport_personnel_id')->constrained('transport_personnel')->restrictOnDelete();
            $table->date('load_date')->default(DB::raw('CURRENT_DATE'));
            $table->timestampTz('load_started_at')->nullable();
            $table->timestampTz('load_completed_at')->nullable();
            $table->decimal('declared_total_weight_kg', 18, 3)->nullable();
            $table->decimal('declared_total_volume_m3', 18, 3)->nullable();
            $table->foreignId('generator_signer_person_id')->constrained('people')->restrictOnDelete();
            $table->timestampTz('generator_signed_at')->nullable();
            $table->foreignId('driver_signer_person_id')->constrained('people')->restrictOnDelete();
            $table->timestampTz('driver_signed_at')->nullable();
            $table->foreignId('pdf_file_id')->nullable()->constrained('files')->nullOnDelete();
            $table->text('observations')->nullable();
            $table->boolean('is_active')->default(true);
            // RN-183-187: esquema offline listo, sin mecanismo de sync todavía.
            $table->string('sync_status', 30)->default('SYNCED');
            $table->timestampTz('device_captured_at')->nullable();
            $table->string('offline_integrity_hash', 128)->nullable();
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();

            // D-MAN-03: único POR ORGANIZACIÓN, reemplaza el UNIQUE global
            // del DDL borrador de esquema-bd.
            $table->unique(['tenant_organization_id', 'manifest_number']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('manifest_loads');
    }
};
