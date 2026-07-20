<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd (unload_requests, D-PRG-02) -- Fase 4 "Cita de Recepción en
// Planta (bilateral)". Solicitud de descargue/recepción -- coordina la
// intención de que un vehículo (o el propio Generador en autotransporte)
// llegue a `receiving_branch_id` con residuos a descargar. Gobernada por el
// motor de Workflow genérico -- ver docblock de `UnloadRequestWorkflowSeeder`
// para el razonamiento de por qué `entity_type=TRANSPORT` (Workflow::ENTITY_TYPES[2])
// y NO `SCHEDULING` (ya exclusivo de `transport_schedules`, D-PRG-14):
// `Workflow::resolveFor()` resuelve el workflow BASE de sistema por
// `entity_type` sin considerar `entity_table` -- reusar `SCHEDULING` haría
// que `Workflow::resolveFor('SCHEDULING', ...)` fuera ambiguo entre el
// workflow "Programación de Transporte" (códigos BOR/PEND/PROG/CONF/EJEC/
// FIN/CANC) y el de esta tabla (códigos DRAFT/SUBMITTED/APPROVED/REJECTED),
// rompiendo la resolución de transiciones de AMBAS entidades.
//
// `manifest_load_id`/`transport_schedule_id` NULL-ABLES (D-PRG-02): NULL =
// solicitud "anticipada" (creada a mano antes de que exista programación/
// manifiesto) o autotransporte sin cargue formal. `origin_branch_id`/
// `carrier_organization_id`/`vehicle_id`/`transport_personnel_id` también
// NULL-ables por el mismo motivo -- se derivan automáticamente del
// `transport_schedule_id` cuando la creación es automática (D-PRG-13,
// `UnloadRequestAutomationService`), o se capturan a mano en la creación
// manual (D-RCP, caso "anticipada").
//
// `service_modality` (D-RCP-02): columna EXPLÍCITA (a diferencia de
// `transport_schedules`, que la infiere por la organización dueña del
// vehículo/conductor asignados, D-PRG-03) -- precedente distinto A
// PROPÓSITO según el propio esquema-bd, no inconsistencia.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('unload_requests', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            // NOT NULL (a diferencia de `transport_schedules`, que sí la
            // deja nullable) -- mismo criterio que `manifest_loads`: siempre
            // se puebla server-side con la organización CARRIER/creadora de
            // la solicitud (`UnloadRequestController::store()`/
            // `UnloadRequestAutomationService`), nunca queda huérfana de
            // tenant aunque `carrier_organization_id` (columna de negocio,
            // distinta de esta) sea NULL en el caso "anticipada" sin
            // transportador todavía asignado.
            $table->foreignId('tenant_organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->string('request_number', 50);
            $table->foreignId('unload_request_status_id')->constrained('unload_request_statuses')->restrictOnDelete();
            $table->foreignId('receiving_branch_id')->constrained('branches')->restrictOnDelete();
            $table->foreignId('manifest_load_id')->nullable()->constrained('manifest_loads')->nullOnDelete();
            $table->foreignId('transport_schedule_id')->nullable()->constrained('transport_schedules')->nullOnDelete();
            $table->foreignId('origin_branch_id')->nullable()->constrained('branches')->nullOnDelete();
            $table->foreignId('carrier_organization_id')->nullable()->constrained('organizations')->nullOnDelete();
            $table->foreignId('vehicle_id')->nullable()->constrained('vehicles')->nullOnDelete();
            $table->foreignId('transport_personnel_id')->nullable()->constrained('transport_personnel')->nullOnDelete();
            // D-RCP-02: discriminador EXPLÍCITO de modalidad.
            $table->string('service_modality', 20)->default('COLLECTION');
            $table->timestampTz('estimated_arrival_at')->nullable();
            $table->string('priority', 20)->default('NORMAL');
            $table->timestampTz('submitted_at')->nullable();
            $table->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampTz('decided_at')->nullable();
            $table->text('rejection_reason')->nullable();
            $table->text('transport_discrepancy_notes')->nullable();
            $table->boolean('is_active')->default(true);
            $table->jsonb('metadata')->nullable()->default(DB::raw("'{}'::jsonb"));
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();

            $table->unique(['tenant_organization_id', 'request_number']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('unload_requests');
    }
};
