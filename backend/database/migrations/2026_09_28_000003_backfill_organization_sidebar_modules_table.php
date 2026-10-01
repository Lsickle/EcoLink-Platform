<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// esquema-bd (2026-09-28): backfill AUTOCONTENIDO de sidebar_modules +
// organization_sidebar_modules -- el pipeline de despliegue solo corre
// `artisan migrate --force`, NUNCA `db:seed`, en producción (hallazgo
// confirmado por el usuario), así que esta migración no puede depender de
// que SidebarModuleSeeder ya haya corrido. Mismo criterio que
// `2026_08_19_000001_add_is_primary_role_to_organization_business_roles_table`
// (backfill vía DB::table/DB::statement crudo, sin pasar por los modelos
// Eloquent).
//
// Objetivo (pedido explícito): ninguna organización pierde acceso a ningún
// grupo del sidebar el día del despliegue -- toda organización existente
// queda con los 7 módulos en is_enabled=true tras correr esta migración.
return new class extends Migration
{
    /**
     * code => [name, sort_order], mismo orden que los 7 grupos del sidebar
     * del frontend.
     *
     * @var array<string, array{0: string, 1: int}>
     */
    private const MODULES = [
        'ORGANIZACION' => ['Organización', 1],
        'RESIDUOS' => ['Residuos', 2],
        'SERVICIOS' => ['Servicios', 3],
        'LOGISTICA' => ['Logística', 4],
        'OPERACIONES' => ['Operaciones', 5],
        'CERTIFICADOS' => ['Certificados', 6],
        'ADMINISTRACION' => ['Administración', 7],
    ];

    public function up(): void
    {
        $now = now();

        DB::table('sidebar_modules')->insertOrIgnore(
            collect(self::MODULES)
                ->map(fn (array $module, string $code) => [
                    'code' => $code,
                    'name' => $module[0],
                    'sort_order' => $module[1],
                    'is_active' => true,
                    'created_at' => $now,
                    'updated_at' => $now,
                ])
                ->values()
                ->all(),
        );

        // Backfill cruzado organización x módulo: toda combinación que no
        // exista aún (organization_id, sidebar_module_id) queda is_enabled=true.
        // ON CONFLICT DO NOTHING cubre tanto el caso "primera vez que corre
        // esta migración" como un reintento idempotente.
        DB::statement(<<<'SQL'
            INSERT INTO organization_sidebar_modules
                (uuid, organization_id, sidebar_module_id, enabled_at, is_enabled, created_at, updated_at)
            SELECT
                gen_random_uuid(),
                organizations.id,
                sidebar_modules.id,
                now(),
                true,
                now(),
                now()
            FROM organizations
            CROSS JOIN sidebar_modules
            WHERE sidebar_modules.code IN ('ORGANIZACION', 'RESIDUOS', 'SERVICIOS', 'LOGISTICA', 'OPERACIONES', 'CERTIFICADOS', 'ADMINISTRACION')
            ON CONFLICT (organization_id, sidebar_module_id) DO NOTHING
        SQL);
    }

    public function down(): void
    {
        DB::table('organization_sidebar_modules')
            ->whereIn('sidebar_module_id', function ($query) {
                $query->select('id')
                    ->from('sidebar_modules')
                    ->whereIn('code', array_keys(self::MODULES));
            })
            ->delete();

        DB::table('sidebar_modules')
            ->whereIn('code', array_keys(self::MODULES))
            ->delete();
    }
};
