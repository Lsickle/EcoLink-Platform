<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd (transport_schedule_items): detalle de residuos cubiertos por
// UNA `transport_schedule` -- resuelve el punto de la tarea "revisa si
// D-PRG dice que es 1:N con varios ítems agrupados, en cuyo caso necesitas
// una tabla puente" (esta tabla YA está anticipada en el DDL borrador de
// esquema-bd, punto 12: `transport_schedule_items` referenciando
// `waste_service_request_item_id`). Una `waste_service_request` puede
// tener varios ítems (`waste_service_request_items`) y solo un subconjunto
// puede quedar cubierto por un viaje/vehículo concreto (recolección
// parcial) -- de ahí la necesidad del puente, en vez de una FK directa
// `waste_service_request_item_id` en la cabecera de `transport_schedules`.
//
// `measurement_unit_id` (normalización, NO en el DDL borrador de
// esquema-bd que usa `unit_of_measure VARCHAR`): se alinea con el patrón ya
// establecido en `waste_service_request_items.measurement_unit_id` (D-S11)
// -- consistencia técnica con la tabla hermana de la que cuelga esta FK
// (`waste_service_request_item_id`), no una regla de negocio nueva.
//
// `route_sequence` (presente en el DDL borrador de esquema-bd) se OMITE
// deliberadamente aquí -- queda superado por `transport_route_stops.stop_sequence`
// (agrupación de VARIAS `transport_schedules` en una ruta, ver esa
// migración), que es el nivel real donde CU-059.3/CU-060 ordenan paradas.
// Mantener ambos sería un campo duplicado y ambiguo sobre cuál manda.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('transport_schedule_items', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('tenant_organization_id')->nullable()->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('transport_schedule_id')->constrained('transport_schedules')->cascadeOnDelete();
            $table->foreignId('waste_service_request_item_id')->constrained('waste_service_request_items')->restrictOnDelete();
            $table->foreignId('waste_id')->constrained('wastes')->restrictOnDelete();
            $table->decimal('scheduled_quantity', 18, 3)->default(0);
            $table->foreignId('measurement_unit_id')->nullable()->constrained('measurement_units')->restrictOnDelete();
            $table->decimal('estimated_weight_kg', 18, 3)->nullable();
            $table->decimal('estimated_volume_m3', 18, 3)->nullable();
            $table->integer('container_quantity')->nullable();
            $table->string('packaging_type', 100)->nullable();
            $table->decimal('length_cm', 10, 2)->nullable();
            $table->decimal('width_cm', 10, 2)->nullable();
            $table->decimal('height_cm', 10, 2)->nullable();
            $table->boolean('requires_special_handling')->default(false);
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
        Schema::dropIfExists('transport_schedule_items');
    }
};
