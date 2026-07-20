<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd (manifest_unload_items) + Módulo Manifiesto de Descargue, Fase 5
// -- detalle de residuos descargados. Decisión de diseño de esta tarea: una
// línea POR CADA `unload_request_item` vinculado al `unload_request_id` del
// manifiesto, derivada automáticamente al crear el manifiesto
// (`ManifestUnloadController::store()`) con cantidades declaradas en 0 --
// `received_quantity`/`rejected_quantity`/`reception_condition`/
// `rejection_reason`/`storage_location_id` se EDITAN después, como parte de
// la inspección física (`ManifestUnloadController::inspectItems()`), ANTES
// de poder generar el manifiesto.
//
// `manifest_load_item_id`/`unload_request_item_id`: D-PRG-05, ambos
// nullable -- mismo patrón que la cabecera.
//
// `storage_location_id` -> `branch_locations.id` (esquema-bd: corregido
// respecto al DDL borrador original, que apuntaba a `locations` inexistente
// -- mismo patrón ya corregido en `waste_treatment_executions.location_id`).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('manifest_unload_items', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('tenant_organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('manifest_unload_id')->constrained('manifest_unloads')->cascadeOnDelete();
            $table->foreignId('manifest_load_item_id')->nullable()->constrained('manifest_load_items')->nullOnDelete();
            $table->foreignId('unload_request_item_id')->nullable()->constrained('unload_request_items')->nullOnDelete();
            $table->foreignId('waste_id')->constrained('wastes')->restrictOnDelete();
            $table->decimal('received_quantity', 18, 3)->default(0);
            $table->decimal('rejected_quantity', 18, 3)->default(0);
            $table->string('unit_of_measure', 20)->default('KG');
            $table->decimal('received_weight_kg', 18, 3)->nullable();
            $table->decimal('rejected_weight_kg', 18, 3)->nullable()->default(0);
            $table->decimal('received_volume_m3', 18, 3)->nullable();
            $table->integer('received_container_quantity')->nullable();
            $table->string('reception_condition', 50)->default('Conforme');
            $table->text('rejection_reason')->nullable();
            $table->boolean('inspection_approved')->default(true);
            $table->foreignId('storage_location_id')->nullable()->constrained('branch_locations')->nullOnDelete();
            $table->timestampTz('received_at')->useCurrent();
            $table->text('observations')->nullable();
            $table->integer('line_number')->default(1);
            $table->boolean('is_active')->default(true);
            $table->jsonb('metadata')->nullable()->default(DB::raw("'{}'::jsonb"));
            // RN-183-187: esquema offline listo, sin mecanismo de sync todavía.
            $table->string('sync_status', 30)->default('SYNCED');
            $table->timestampTz('device_captured_at')->nullable();
            $table->string('offline_integrity_hash', 128)->nullable();
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('manifest_unload_items');
    }
};
