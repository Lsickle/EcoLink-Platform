<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// Hallazgo (implementación del CRUD de Organizaciones, 2026-07-15):
// `organizations.tax_id` nunca tuvo restricción UNIQUE real en base de
// datos -- ni simple ni compuesta con `tax_id_type` (RN-002/T-04) -- solo
// un comentario de intención en la migración original y una validación de
// aplicación (`Rule::unique()` en `OrganizationController::store()`), que
// deja una ventana de condición de carrera entre requests concurrentes. Se
// cierra con un índice único PARCIAL de Postgres, mismo mecanismo ya usado
// en `add_unique_single_platform_tenant_index_to_organizations_table` --
// parcial porque `organizations` usa SoftDeletes: una fila borrada
// (`deleted_at` no nulo) no debe bloquear que un `tax_id`+`tax_id_type` se
// reutilice en una organización nueva.
return new class extends Migration
{
    public function up(): void
    {
        DB::statement(
            'CREATE UNIQUE INDEX organizations_tax_id_tax_id_type_unique '.
            'ON organizations (tax_id, tax_id_type) '.
            'WHERE deleted_at IS NULL'
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS organizations_tax_id_tax_id_type_unique');
    }
};
