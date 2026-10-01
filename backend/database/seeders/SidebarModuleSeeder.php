<?php

namespace Database\Seeders;

use App\Models\SidebarModule;
use Illuminate\Database\Seeder;

/**
 * Catálogo de los 7 grupos temáticos del sidebar del frontend. Redundante e
 * idempotente respecto a la migración de backfill
 * `2026_09_28_000003_backfill_organization_sidebar_modules_table` -- esta
 * clase existe solo para dev/CI (`db:seed`), que el pipeline de despliegue
 * real nunca ejecuta (ver AVISO en esa migración).
 */
class SidebarModuleSeeder extends Seeder
{
    public function run(): void
    {
        $modules = [
            ['code' => 'ORGANIZACION', 'name' => 'Organización', 'sort_order' => 1],
            ['code' => 'RESIDUOS', 'name' => 'Residuos', 'sort_order' => 2],
            ['code' => 'SERVICIOS', 'name' => 'Servicios', 'sort_order' => 3],
            ['code' => 'LOGISTICA', 'name' => 'Logística', 'sort_order' => 4],
            ['code' => 'OPERACIONES', 'name' => 'Operaciones', 'sort_order' => 5],
            ['code' => 'CERTIFICADOS', 'name' => 'Certificados', 'sort_order' => 6],
            ['code' => 'ADMINISTRACION', 'name' => 'Administración', 'sort_order' => 7],
        ];

        foreach ($modules as $module) {
            SidebarModule::query()->updateOrCreate(
                ['code' => $module['code']],
                [
                    'name' => $module['name'],
                    'sort_order' => $module['sort_order'],
                    'is_active' => true,
                ],
            );
        }
    }
}
