<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// esquema-bd (item 17/D-WF-01): `workflow_entity_bindings` -- hace explícita
// la relación "esta entidad/columna de estado usa este workflow", hoy
// implícita en código.
//
// CORRECCIÓN sobre el DDL resumido del skill (documentada aquí, no es una
// desviación de una decisión real): el skill declara `UNIQUE(entity_table)`,
// pero `waste_treatment_approvals` necesita DOS bindings simultáneos --uno
// para `technical_status_id`, otro para `commercial_status_id` (misma
// tabla, dos ejes de estado independientes, ver docblock de
// WasteTreatmentApproval). `UNIQUE(entity_table)` a secas lo haría
// imposible. Se usa `UNIQUE(entity_table, status_column)` en su lugar --
// una entidad puede tener varias columnas de estado, pero cada columna
// tiene un único workflow activo.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('workflow_entity_bindings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workflow_id')->constrained('workflows')->cascadeOnDelete();
            $table->string('entity_table', 100);
            $table->string('status_catalog_table', 100);
            $table->string('status_column', 100);

            $table->unique(['entity_table', 'status_column']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('workflow_entity_bindings');
    }
};
