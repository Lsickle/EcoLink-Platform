<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd (skill esquema-bd, item 17/D-WF-01): `workflows` -- definición
// de un motor de workflow configurable (RN-170). `tenant_organization_id`
// NULL = definición de sistema/base (compartida, `is_system=true`); un
// valor = personalización de esa organización (consumida por
// `Workflow::resolveFor()`/`WorkflowResolver` vía `workflow_service_bindings`,
// no exclusivamente por esta columna -- ver docblock del modelo).
//
// `entity_type`: enum de APLICACIÓN (no CHECK de BD todavía, por
// instrucción explícita de este lote) -- incluye los 12 valores
// documentados en esquema-bd aunque solo `TREATMENT` se use en este lote:
// WASTE/SERVICE/TRANSPORT/MANIFEST/CERTIFICATE/CONCILIATION/TREATMENT/
// ORGANIZATION/BRANCH/CONTACT/SCHEDULING/DOCUMENT.
//
// `current_version_id` -> `workflow_versions.id`: referencia circular
// (`workflow_versions.workflow_id` -> `workflows.id`). Mismo patrón ya
// usado en el proyecto para resolver ciclos de FK (ver
// `add_audit_foreign_keys_to_organizations_and_people_tables`): esta
// migración crea la columna SIN la constraint; la constraint se agrega en
// `add_current_version_id_foreign_to_workflows_table` después de que
// `workflow_versions` exista.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('workflows', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('tenant_organization_id')->nullable()->constrained('organizations')->cascadeOnDelete();
            $table->string('code', 100);
            $table->string('name', 150);
            $table->text('description')->nullable();
            $table->string('entity_type', 50);
            $table->boolean('is_system')->default(false);
            $table->boolean('is_active')->default(true);
            // Sin FK todavía -- ver add_current_version_id_foreign_to_workflows_table.
            $table->unsignedBigInteger('current_version_id')->nullable();
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();

            // Único por tenant (NULL cuenta como un único grupo en Postgres,
            // suficiente para el catálogo base de este lote -- un mismo
            // `code` de sistema no puede duplicarse).
            $table->unique(['tenant_organization_id', 'code']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('workflows');
    }
};
