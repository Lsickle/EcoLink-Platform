<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd (item 17/D-WF-01): `workflow_transition_roles` -- quién puede
// ejecutar una transición. Exactamente uno de `role_id`/`business_role_id`
// debe ser no-nulo (rol de sistema/RBAC vs. tipo de organización) --
// enforzado con un CHECK de BD (más fuerte que solo a nivel de aplicación,
// y de bajo costo: un XOR simple). El fluent builder de este Laravel no
// expone `Blueprint::check()` -- se agrega vía `DB::statement()` (mismo
// mecanismo ya usado en el proyecto para índices parciales, ver
// `branch_treatments_internal_code_unique`).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('workflow_transition_roles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workflow_transition_id')->constrained('workflow_transitions')->cascadeOnDelete();
            $table->foreignId('role_id')->nullable()->constrained('roles')->cascadeOnDelete();
            $table->foreignId('business_role_id')->nullable()->constrained('business_roles')->cascadeOnDelete();
        });

        DB::statement(
            'ALTER TABLE workflow_transition_roles ADD CONSTRAINT workflow_transition_roles_exactly_one_role_check CHECK ((role_id IS NOT NULL) <> (business_role_id IS NOT NULL))'
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('workflow_transition_roles');
    }
};
