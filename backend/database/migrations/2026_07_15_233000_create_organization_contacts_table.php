<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd: organization_contacts (D-P02 / L-08) -- pivote N:N real
// Contacto<->Organización con atributos, reemplaza el modelo viejo 1:1
// (`people.organization_id`). Debe crearse DESPUÉS de `branches`
// (2026_07_14_000009) por la FK opcional `branch_id`.
//
// `position_id` documentado en esquema-bd NO se replica aquí -- el catálogo
// `positions` (eje 3, cargos) fue diferido explícitamente en una sesión
// previa como "tema de ingeniería" y no existe en el código (sin modelo
// `Position`, sin migración `positions`). Se usa `position_title`
// VARCHAR(150) de texto libre en su lugar (decisión ya confirmada en el
// plan de este lote, no reinterpretación propia).
//
// Índice único: la intención de negocio es que un contacto no pueda tener
// dos vínculos activos a la MISMA organización sin sede, ni dos vínculos a
// la MISMA organización+sede. Un UNIQUE simple (contact_id, organization_id,
// branch_id) NO cumple esto para el caso sin sede -- en Postgres cada
// branch_id NULL se considera distinto de cualquier otro NULL, así que dos
// filas con branch_id=NULL para el mismo contacto+organización no
// colisionarían. Se resuelve con dos índices únicos PARCIALES (mismo patrón
// DB::statement() ya usado en
// add_unique_single_platform_tenant_index_to_organizations_table): uno para
// branch_id NOT NULL (donde un UNIQUE normal ya bastaría, pero se declara
// parcial por simetría/documentación) y otro para branch_id IS NULL (el caso
// que un UNIQUE simple no cubre).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('organization_contacts', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('tenant_organization_id')->nullable()->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('contact_id')->constrained('people')->cascadeOnDelete();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
            $table->string('position_title', 150)->nullable();
            $table->string('relationship_type', 30)->nullable();
            $table->boolean('is_primary')->default(false);
            $table->date('start_date')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
        });

        DB::statement(
            'CREATE UNIQUE INDEX organization_contacts_contact_org_branch_unique '.
            'ON organization_contacts (contact_id, organization_id, branch_id) '.
            'WHERE branch_id IS NOT NULL'
        );

        DB::statement(
            'CREATE UNIQUE INDEX organization_contacts_contact_org_no_branch_unique '.
            'ON organization_contacts (contact_id, organization_id) '.
            'WHERE branch_id IS NULL'
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('organization_contacts');
    }
};
