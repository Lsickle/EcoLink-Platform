<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd (Módulo Solicitudes de Servicio, D-S02/D-S05/D-S15):
// service_statuses -- catálogo de estados de `waste_service_requests`,
// mismo patrón D-R05 (catálogo global + personalización por organización
// Gestor). `organization_id` NULL = catálogo GLOBAL/default (aplica por
// defecto a TODAS las solicitudes, D-S02); un valor = estado PERSONALIZADO
// de ESE Gestor -- solo aplica cuando TODOS los ítems de la solicitud van
// dirigidos a ese mismo Gestor (D-S01/D-S02, regla de APLICACIÓN, no de
// esquema -- no se modela aquí, es responsabilidad de la futura capa de
// orquestación de Solicitudes, D-S27).
//
// `is_system_status` (D-S05, confirmado por el usuario): true = fila
// sembrada del catálogo BASE (ServiceStatusSeeder, "aplica para TODOS los
// Servicios"), NO "estado protegido no editable" -- semántica distinta e
// independiente de `blocks_editing` (RN-SOL-006: solo Draft edita
// libremente).
//
// Nomenclatura `code`/`name`/`sequence_order`/`is_initial_status`/
// `is_terminal_status`/`is_system_status`/`blocks_editing` -- D-S15
// (canonización hacia adelante del patrón "catálogo de estado" para
// catálogos NUEVOS, variante más completa ya usada por
// `service_statuses`/`certificate_statuses` en esquema-bd, con los nombres
// de columna EXACTOS confirmados textualmente en esa decisión: "code, name,
// sequence_order, is_initial_status, is_terminal_status, is_system_status,
// blocks_editing").
//
// Sin `tenant_organization_id` -- a diferencia de `respel_statuses` (que
// SIEMPRE pertenece a la organización PLATAFORMA, catálogo compartido sin
// personalización), este catálogo usa EXCLUSIVAMENTE `organization_id` como
// discriminador global/Gestor (D-S02). Es una tabla nueva sin datos legacy
// que reconciliar con la versión `tenant_organization_id` del borrador de
// esquema-bd/SKILL.md (ese borrador es anterior a D-S02 y quedó reemplazado
// por el ALTER propuesto en `02-arquitecto-datos.md` §1.1, ya confirmado por
// D-S05).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('service_statuses', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('organization_id')->nullable()->constrained('organizations')->cascadeOnDelete();
            $table->string('code', 50);
            $table->string('name', 120);
            $table->text('description')->nullable();
            $table->integer('sequence_order')->default(0);
            $table->boolean('is_initial_status')->default(false);
            $table->boolean('is_terminal_status')->default(false);
            $table->boolean('is_system_status')->default(false);
            $table->boolean('blocks_editing')->default(false);
            $table->boolean('is_active')->default(true);
            $table->jsonb('metadata')->nullable()->default(DB::raw("'{}'::jsonb"));
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();
        });

        // `code` único por organización cuando `organization_id` NOT NULL, y
        // único GLOBALMENTE entre las filas del catálogo base
        // (`organization_id IS NULL`) -- un UNIQUE simple no basta porque
        // Postgres trata cada NULL como distinto (mismo problema/solución ya
        // documentado en `create_organization_contacts_table`), así que se
        // usan 2 índices únicos parciales.
        DB::statement(
            'CREATE UNIQUE INDEX service_statuses_organization_id_code_unique ON service_statuses (organization_id, code) WHERE organization_id IS NOT NULL AND deleted_at IS NULL'
        );
        DB::statement(
            'CREATE UNIQUE INDEX service_statuses_code_unique_global ON service_statuses (code) WHERE organization_id IS NULL AND deleted_at IS NULL'
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('service_statuses');
    }
};
