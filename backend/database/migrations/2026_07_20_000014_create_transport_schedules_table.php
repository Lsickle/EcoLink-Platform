<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd (transport_schedules) + Módulo Programación Logística
// (D-PRG-01 a D-PRG-14): agregado central de "Programar Recolección"
// (CU-026), reprogramar (CU-027), cancelar (CU-028), asignar vehículo/
// conductor (CU-029/030) y recolección masiva (CU-059). Una fila = un
// viaje/vehículo asignado a UNA `waste_service_request` de origen (el
// agrupamiento de VARIOS ítems dentro de esa solicitud vive en
// `transport_schedule_items`; el agrupamiento de VARIAS programaciones en
// una ruta con orden de parada vive en `transport_routes`/
// `transport_route_stops` -- ver sus migraciones).
//
// `organization_id` (NUEVO, no está en el DDL borrador de esquema-bd):
// organización que PROGRAMA el transporte -- Gestor/Subgestor en Modalidad
// 1 (recolección), o el propio Generador (con `business_role
// TRANSPORTER` adquirido, D-PRG-04) en Modalidad 2 (autotransporte).
// `restrictOnDelete()` -- mismo criterio que `waste_service_requests.branch_id`:
// una organización con programaciones activas no debe poder borrarse.
//
// `vehicle_id`/`transport_personnel_id` NOT NULL (D-PRG-03, citado
// TEXTUALMENTE en la tarea): "no quedan NULL -- se llenan directamente con
// el vehículo/conductor del propio Generador" en Modalidad 2. La modalidad
// se INFIERE por la organización propietaria del recurso asignado
// (`vehicles.organization_id`/`transport_personnel.organization_id`), sin
// discriminador `execution_party` aparte (D-PRG-03 lo descarta
// explícitamente).
//
// FLAG explícito (no una reinterpretación silenciosa): el DDL borrador de
// esquema-bd declaraba estas 2 columnas NULLABLE por el ciclo de vida
// Draft->Scheduled (`00-inventario.md §4`: "vehicle_id/transport_personnel_id
// son nullable, pero por ciclo de vida Draft->Scheduled, no por diseño de
// autotransporte"), y ningún D-PRG resuelve explícitamente si una fila de
// `transport_schedules` debe existir ANTES de que el Coordinador
// Logístico/Generador escoja vehículo+conductor (estados BOR/PEND del
// catálogo `transport_statuses` sugieren que sí). Esta migración sigue la
// instrucción explícita de la tarea (D-PRG-03, "NUNCA null") -- se
// documenta aquí para que el próximo lote (controller) decida
// deliberadamente si el wizard CU-026.1-.8 retiene los datos en memoria/
// sesión hasta que haya vehículo+conductor antes de hacer INSERT, en vez de
// asumir un INSERT parcial seguido de UPDATE.
//
// `destination_branch_id` (D-PRG-06/D-PRG-12): CU-026.6 se amplía a
// "Definir Punto de Recolección y Destino" -- ambas columnas son
// obligatorias desde el diseño de esta tabla.
//
// `scheduled_pickup_at`/`pickup_window_start`/`pickup_window_end`: separan
// los 3 subcasos CU-026.3 "Definir Fecha" + .4 "Definir Hora" (un solo
// TIMESTAMPTZ) de CU-026.5 "Definir Ventana Operativa" (rango aparte).
//
// `responsible_user_id` (CU-026.8 "Asignar Responsable Logístico"):
// `nullOnDelete()` -- perder al usuario responsable no debe bloquear el
// borrado de ese usuario ni de la programación.
//
// `version_number`/`parent_schedule_id` (CU-027 Reprogramar): mismo patrón
// que `plant_reception_schedules` (docs de Recepción en Planta) -- el
// historial de reprogramaciones se seguirá por versión, no por un estado
// "Rescheduled" aparte (confirmado en vivo contra Figma, sin ese estado en
// el catálogo real de 7 valores, ver `06-especialista-ux.md` Adenda).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('transport_schedules', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('tenant_organization_id')->nullable()->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('organization_id')->constrained('organizations')->restrictOnDelete();
            $table->foreignId('waste_service_request_id')->constrained('waste_service_requests')->restrictOnDelete();
            $table->foreignId('transport_status_id')->constrained('transport_statuses')->restrictOnDelete();
            $table->string('schedule_number', 50)->unique();
            $table->foreignId('source_branch_id')->constrained('branches')->restrictOnDelete();
            $table->foreignId('destination_branch_id')->constrained('branches')->restrictOnDelete();
            // D-PRG-03: NUNCA null, en NINGUNA modalidad -- ver docblock arriba.
            $table->foreignId('vehicle_id')->constrained('vehicles')->restrictOnDelete();
            $table->foreignId('transport_personnel_id')->constrained('transport_personnel')->restrictOnDelete();
            $table->foreignId('responsible_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampTz('scheduled_pickup_at');
            $table->timestampTz('pickup_window_start')->nullable();
            $table->timestampTz('pickup_window_end')->nullable();
            $table->string('priority', 20)->default('NORMAL');
            $table->decimal('estimated_weight_kg', 18, 3)->nullable();
            $table->decimal('estimated_volume_m3', 18, 3)->nullable();
            $table->decimal('planned_distance_km', 10, 2)->nullable();
            $table->integer('planned_duration_minutes')->nullable();
            $table->boolean('requires_special_handling')->default(false);
            $table->text('observations')->nullable();
            $table->integer('version_number')->default(1);
            $table->foreignId('parent_schedule_id')->nullable()->constrained('transport_schedules')->nullOnDelete();
            $table->boolean('is_active')->default(true);
            $table->jsonb('metadata')->nullable()->default(DB::raw("'{}'::jsonb"));
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transport_schedules');
    }
};
