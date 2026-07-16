<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// Hallazgo Bajo (especialista-seguridad, revisión del mecanismo de invitación,
// 2026-07-14): D-CER-04 ("exactamente una fila is_platform_tenant=true en
// todo el sistema", ver organizations.is_platform_tenant y
// User::isPlatformStaff()) solo se sostenía por disciplina del seeder
// (PlatformOrganizationSeeder), sin ningún constraint de base de datos que la
// protegiera. Se agrega un índice único PARCIAL de Postgres -- solo cubre las
// filas con is_platform_tenant=true, así que las N filas con valor false no
// compiten por unicidad entre sí (a diferencia de un UNIQUE normal sobre la
// columna, que fallaría con la primera organización tenant regular).
//
// El schema builder de Laravel no tiene helper nativo para índices únicos
// parciales (WHERE) -- no hay precedente de DB::statement() en migraciones
// de este proyecto (verificado: ningún otro archivo en
// database/migrations/ lo usa), así que se sigue la sintaxis estándar de
// Postgres directamente.
return new class extends Migration
{
    public function up(): void
    {
        DB::statement(
            'CREATE UNIQUE INDEX organizations_single_platform_tenant '.
            'ON organizations (is_platform_tenant) '.
            'WHERE is_platform_tenant = true'
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS organizations_single_platform_tenant');
    }
};
