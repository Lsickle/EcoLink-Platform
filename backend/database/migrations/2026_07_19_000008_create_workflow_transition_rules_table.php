<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd (item 17/D-WF-01): `workflow_transition_rules` -- validaciones
// adicionales que debe cumplir una transición antes de ejecutarse
// (FIELD_REQUIRED/ALL_ITEMS_APPROVED/CUSTOM_VALIDATOR/...). Sin filas
// sembradas en este lote (el controller actual no tiene reglas de este
// tipo -- ver docblock de WorkflowSeeder).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('workflow_transition_rules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workflow_transition_id')->constrained('workflow_transitions')->cascadeOnDelete();
            $table->string('rule_type', 60);
            $table->jsonb('rule_definition')->nullable()->default(DB::raw("'{}'::jsonb"));
            $table->string('error_message', 500)->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('workflow_transition_rules');
    }
};
