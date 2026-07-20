<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd (manifest_load_items) + Módulo Manifiesto de Cargue, Fase 3 --
// detalle de residuos de un `manifest_load`. Decisión de diseño de ESTA
// tarea: una línea POR CADA `transport_schedule_item` vinculado al
// `transport_schedule_id` del manifiesto, derivada automáticamente al crear
// el manifiesto (`ManifestLoadController::store()`) -- no se seleccionan a
// mano.
//
// `transport_schedule_item_id` NULLABLE + `nullOnDelete()`: mismo patrón que
// `manifest_unload_items.manifest_load_item_id` (D-PRG-05) -- referencia de
// trazabilidad hacia el ítem de programación de origen, no bloqueante.
//
// `approved_treatment_id` -> `waste_treatment_approvals.id` (esquema-bd:
// nombre de tabla YA corregido respecto al DDL borrador original, que
// apuntaba erróneamente a `approved_waste_treatments`, inexistente) --
// derivado de `transport_schedule_item.wasteServiceRequestItem.waste_treatment_approval_id`.
//
// `unit_of_measure` VARCHAR(20) (NO FK a `measurement_units`, tal como
// especifica el DDL de esquema-bd para esta tabla en concreto) -- distinto
// del patrón ya normalizado en `waste_service_request_items`/
// `transport_schedule_items` (`measurement_unit_id FK`); se sigue la
// columna EXACTA documentada para `manifest_load_items`, no se reinterpreta.
//
// Columnas offline (RN-183-187): mismo criterio que `manifest_loads`.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('manifest_load_items', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('tenant_organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('manifest_load_id')->constrained('manifest_loads')->cascadeOnDelete();
            $table->foreignId('transport_schedule_item_id')->nullable()->constrained('transport_schedule_items')->nullOnDelete();
            $table->foreignId('waste_id')->constrained('wastes')->restrictOnDelete();
            $table->foreignId('approved_treatment_id')->nullable()->constrained('waste_treatment_approvals')->nullOnDelete();
            $table->decimal('declared_quantity', 18, 3)->default(0);
            $table->string('unit_of_measure', 20)->default('KG');
            $table->decimal('actual_weight_kg', 18, 3)->nullable();
            $table->decimal('actual_volume_m3', 18, 3)->nullable();
            $table->integer('container_quantity')->nullable();
            $table->string('packaging_type', 100)->nullable();
            $table->string('internal_container_code', 100)->nullable();
            $table->string('packaging_condition', 50)->nullable();
            $table->boolean('transport_approved')->default(true);
            $table->boolean('special_handling_required')->default(false);
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
        Schema::dropIfExists('manifest_load_items');
    }
};
