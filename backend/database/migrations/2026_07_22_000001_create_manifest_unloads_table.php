<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd (manifest_unloads) + Módulo Manifiesto de Descargue, Fase 5 --
// documento/registro firmado en la planta del Gestor AL DESCARGAR los
// residuos transportados. Gobernado por el motor de Workflow genérico
// (`entity_type=MANIFEST`, MISMO catálogo `manifest_statuses` de Fase 3, pero
// una `workflow_transitions`/`workflow_entity_bindings` PROPIA para esta
// tabla -- ver docblock de `ManifestUnloadWorkflowSeeder` y de
// `Workflow::resolveFor()` para el mecanismo de desambiguación por
// `entity_table` que esta fase introduce).
//
// `manifest_number`: D-RCP-14 (NULL-able hasta sincronizar, numeración
// diferida bajo captura offline) + D-MAN-03 (único POR ORGANIZACIÓN) --
// siempre se genera server-side en este lote (`ManifestUnloadController::store()`),
// mismo criterio que `manifest_loads`.
//
// `manifest_status_id`: MISMO catálogo `manifest_statuses` de Fase 3
// (RCP-19/D-MAN-01) -- sin catálogo nuevo.
//
// `manifest_load_id`/`unload_request_id`: D-PRG-05, AMBOS nullable -- pero
// esta tarea exige que AL MENOS UNO esté presente (ruta de trazabilidad
// dual). No expresable como constraint de columna simple (depende de 2
// columnas), se impone vía CHECK explícito abajo -- decisión de diseño de
// esta tarea, punto de la especificación "agrégala como validación
// explícita". En la práctica, `ManifestUnloadController::store()` SIEMPRE
// puebla `unload_request_id` (la creación parte de una `unload_requests`
// Aprobada); `manifest_load_id` se propaga automáticamente cuando existe.
//
// `receiving_branch_id`/`receiving_organization_id`/`vehicle_id`/
// `transport_personnel_id`: se DERIVAN automáticamente de la `unload_request`
// (y su `plant_reception_schedule` Confirmada) al crear el manifiesto -- no
// se aceptan independientes en el payload (mismo criterio "fuente única de
// verdad" que `manifest_loads` con `transport_schedule_id`).
//
// `receiver_person_id`: se elige a mano al crear (una `Person` de la
// organización RECEPTORA, ver `ManifestUnloadController::assertPersonBelongsToOrganization()`).
// `driver_signer_person_id`: se deriva automáticamente de
// `transport_personnel.person_id`. Ambas `restrictOnDelete()` -- mismo
// criterio que `manifest_loads`.
//
// Columnas offline (RN-183-187): mismo criterio que `manifest_loads`.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('manifest_unloads', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('tenant_organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->string('manifest_number', 50)->nullable();
            $table->foreignId('manifest_status_id')->constrained('manifest_statuses')->restrictOnDelete();
            $table->foreignId('manifest_load_id')->nullable()->constrained('manifest_loads')->nullOnDelete();
            $table->foreignId('unload_request_id')->nullable()->constrained('unload_requests')->nullOnDelete();
            $table->foreignId('receiving_branch_id')->constrained('branches')->restrictOnDelete();
            $table->foreignId('receiving_organization_id')->constrained('organizations')->restrictOnDelete();
            $table->foreignId('vehicle_id')->constrained('vehicles')->restrictOnDelete();
            $table->foreignId('transport_personnel_id')->constrained('transport_personnel')->restrictOnDelete();
            $table->date('unload_date')->default(DB::raw('CURRENT_DATE'));
            $table->timestampTz('unload_started_at')->nullable();
            $table->timestampTz('unload_completed_at')->nullable();
            $table->decimal('received_total_weight_kg', 18, 3)->nullable();
            $table->decimal('rejected_total_weight_kg', 18, 3)->nullable()->default(0);
            $table->decimal('received_total_volume_m3', 18, 3)->nullable();
            $table->boolean('received_as_expected')->default(true);
            $table->foreignId('receiver_person_id')->constrained('people')->restrictOnDelete();
            $table->timestampTz('receiver_signed_at')->nullable();
            $table->foreignId('driver_signer_person_id')->constrained('people')->restrictOnDelete();
            $table->timestampTz('driver_signed_at')->nullable();
            $table->foreignId('pdf_file_id')->nullable()->constrained('files')->nullOnDelete();
            $table->text('incidents')->nullable();
            $table->text('observations')->nullable();
            $table->boolean('is_active')->default(true);
            // RN-183-187: esquema offline listo, sin mecanismo de sync todavía.
            $table->string('sync_status', 30)->default('SYNCED');
            $table->timestampTz('device_captured_at')->nullable();
            $table->string('offline_integrity_hash', 128)->nullable();
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();

            // D-MAN-03: único POR ORGANIZACIÓN (NULL no participa del índice,
            // no bloquea mientras `manifest_number` no esté poblado).
            $table->unique(['tenant_organization_id', 'manifest_number']);
        });

        // Regla real de esta tarea: AL MENOS UNO de manifest_load_id/
        // unload_request_id debe estar presente (D-PRG-05, ruta de
        // trazabilidad dual) -- no expresable como constraint de columna
        // simple de Blueprint, se agrega vía SQL crudo.
        DB::statement(
            'ALTER TABLE manifest_unloads ADD CONSTRAINT manifest_unloads_load_or_request_check '.
            'CHECK (manifest_load_id IS NOT NULL OR unload_request_id IS NOT NULL)'
        );

        // Hallazgo Medio de Fase 3 (revisión de seguridad, ver
        // `add_active_unique_index_to_manifest_loads_table`), replicado aquí:
        // como máximo UN manifiesto de descargue ACTIVO por `unload_request_id`
        // -- evita doble registro/doble facturación del mismo evento de
        // descargue. `unload_request_id` es la ruta de derivación real de
        // `ManifestUnloadController::store()` en este lote (siempre poblada),
        // por eso el índice se apoya en esa columna, no en `manifest_load_id`.
        DB::statement(
            'CREATE UNIQUE INDEX manifest_unloads_active_unique '.
            'ON manifest_unloads (unload_request_id) '.
            'WHERE is_active = true AND deleted_at IS NULL AND unload_request_id IS NOT NULL'
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('manifest_unloads');
    }
};
