<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Hallazgo (implementación del CRUD de Sedes, 2026-07-15): la migración
// original `create_branches_table` declaró `unique(['organization_id',
// 'code'])` como constraint PLANO -- `branches` usa SoftDeletes, así que ese
// constraint plano bloquea reutilizar un `code` tras un soft-delete (una
// fila borrada sigue "ocupando" el valor), contradiciendo el criterio de
// unicidad ya aplicado en este mismo lote para `organizations.tax_id`
// (`Rule::unique()->whereNull('deleted_at')` en el controller,
// respaldado por un índice único PARCIAL en BD). Se reemplaza por el mismo
// mecanismo exacto que `add_unique_tax_id_index_to_organizations_table`.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('branches', function ($table) {
            $table->dropUnique('branches_organization_id_code_unique');
        });

        DB::statement(
            'CREATE UNIQUE INDEX branches_organization_id_code_unique '.
            'ON branches (organization_id, code) '.
            'WHERE deleted_at IS NULL'
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS branches_organization_id_code_unique');

        Schema::table('branches', function ($table) {
            $table->unique(['organization_id', 'code']);
        });
    }
};
