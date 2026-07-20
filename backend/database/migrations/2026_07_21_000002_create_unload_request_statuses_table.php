<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd (unload_requests, D-PRG-02) -- Fase 4 "Cita de Recepción en
// Planta". `unload_requests.status` está gobernado por el motor de Workflow
// genérico (D-WF-01), NO por una columna VARCHAR libre -- necesita su propio
// catálogo de estados, mismo patrón EXACTO que `manifest_statuses`/
// `transport_statuses` (catálogo BASE sembrado bajo la organización
// PLATAFORMA, `tenant_organization_id` NOT NULL, sin `is_system`/activación-
// por-organización todavía -- mismo diferimiento ya aplicado por
// D-PRG-08/D-S15).
//
// Grafo grueso confirmado por esta tarea (mismo espíritu que
// `ServiceRequestWorkflowSeeder`, pero sin agregado por ítems):
// Draft -> Submitted -> Approved/Rejected (4 valores, ver
// UnloadRequestStatusSeeder).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('unload_request_statuses', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('tenant_organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->string('code', 50);
            $table->string('name', 100);
            $table->text('description')->nullable();
            $table->integer('sort_order')->default(1);
            $table->boolean('is_initial')->default(false);
            $table->boolean('is_final')->default(false);
            $table->string('color_hex', 7)->nullable();
            $table->string('icon', 100)->nullable();
            $table->boolean('is_active')->default(true);
            $table->jsonb('metadata')->nullable()->default(DB::raw("'{}'::jsonb"));
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();

            // Mismo criterio que `manifest_statuses`/`transport_statuses`:
            // necesario para la resolución determinística de
            // `from_status_code`/`to_status_code` en `workflow_transitions`.
            $table->unique(['tenant_organization_id', 'code']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('unload_request_statuses');
    }
};
