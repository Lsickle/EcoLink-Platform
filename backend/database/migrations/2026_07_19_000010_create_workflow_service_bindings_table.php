<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// esquema-bd (item 17/D-WF-01): `workflow_service_bindings` -- personaliza
// qué workflow usa un `entity_type` para un sub-contexto (`scope_type`)
// concreto. Para personalización por organización: `scope_type='organization'`,
// `scope_id=organizations.id` -- consumido por
// `Workflow::resolveFor()`/`WorkflowResolver` (ver su docblock).
//
// Sin FK real sobre `scope_id` (sería polimórfica según `scope_type`, no
// expresable como FK de Postgres simple) -- mismo criterio que las columnas
// polimórficas ya existentes en el proyecto (`files.entity_type`/
// `entity_id`, `audit_logs.entity_name`/`entity_id`).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('workflow_service_bindings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workflow_id')->constrained('workflows')->cascadeOnDelete();
            $table->string('scope_type', 50);
            $table->unsignedBigInteger('scope_id');

            $table->unique(['scope_type', 'scope_id', 'workflow_id']);
            $table->index(['scope_type', 'scope_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('workflow_service_bindings');
    }
};
