<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Hallazgo (especialista-seguridad, revisión de WorkflowController, requisito
// 3): nada impedía que dos `workflow_service_bindings` ACTIVOS apuntaran a
// workflows DISTINTOS para el mismo `(scope_type, scope_id)` y `entity_type`
// -- el UNIQUE original (`scope_type, scope_id, workflow_id`, ver
// `create_workflow_service_bindings_table`) solo evita duplicar la MISMA fila,
// no evita que un segundo binding con OTRO `workflow_id` conviva con el
// primero para el mismo scope, dejando `Workflow::resolveFor()` no
// determinístico (`->first()` sobre más de una fila candidata).
//
// `entity_type` se denormaliza aquí (copiado del `workflow` referenciado, ver
// `WorkflowServiceBinding::booted()`) porque `workflow_service_bindings` no
// tiene FK directa a esa columna -- vive en `workflows.entity_type` -- y un
// UNIQUE de Postgres no puede expresarse contra una columna de OTRA tabla sin
// desnormalizar o usar un trigger. Se prefiere la columna denormalizada
// (más simple, ya es el patrón usado en el proyecto para snapshots, ver
// `waste_treatment_executions.treatment_snapshot`) sobre un trigger.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('workflow_service_bindings', function (Blueprint $table) {
            $table->string('entity_type', 50)->nullable()->after('workflow_id');
        });

        DB::statement(<<<'SQL'
            UPDATE workflow_service_bindings b
            SET entity_type = w.entity_type
            FROM workflows w
            WHERE w.id = b.workflow_id
        SQL);

        DB::statement('ALTER TABLE workflow_service_bindings ALTER COLUMN entity_type SET NOT NULL');

        Schema::table('workflow_service_bindings', function (Blueprint $table) {
            // Determinismo de Workflow::resolveFor(): un solo binding vivo
            // por (scope_type, scope_id, entity_type), sin importar a qué
            // workflow apunte.
            $table->unique(['scope_type', 'scope_id', 'entity_type'], 'workflow_service_bindings_scope_entity_unique');
        });
    }

    public function down(): void
    {
        Schema::table('workflow_service_bindings', function (Blueprint $table) {
            $table->dropUnique('workflow_service_bindings_scope_entity_unique');
            $table->dropColumn('entity_type');
        });
    }
};
