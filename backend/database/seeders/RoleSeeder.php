<?php

namespace Database\Seeders;

use App\Models\Role;
use Illuminate\Database\Seeder;

/**
 * roles-canonicos.md (eje 1, RBAC): catálogo global de 9 roles vigentes.
 * Alcance confirmado de este lote (RBAC Usuarios/Roles/Permisos): SOLO se
 * siembra ADMINISTRADOR -- los otros 8 (incluido AUDITOR) quedan
 * documentados en el catálogo canónico pero no se siembran aquí por
 * decisión explícita (no tienen permisos reales definidos en ninguna
 * fuente todavía).
 *
 * `LOGÍSTICA` (CU-051, Vehículos, 2026-07-16): rol #7 de 9 del catálogo
 * canónico (`roles-canonicos.md`), con tilde -- código canónico exacto, no
 * se transcribe sin ella. Es el primer rol de negocio real que se siembra
 * además de ADMINISTRADOR, mismo patrón de sistema
 * (`tenant_organization_id: null`, `is_system: true`, `is_editable: false`)
 * -- SOLO tiene permisos de lectura (`vehicles.read`) en este lote, ver
 * RolePermissionSeeder. `priority_level=3`: un nivel por debajo de
 * ADMINISTRADOR (1), criterio propio de este lote (sin escala de
 * priority_level confirmada por el negocio para roles no-ADMINISTRADOR
 * todavía) -- deja margen (2) para roles intermedios que se siembren
 * después sin tener que renumerar.
 */
class RoleSeeder extends Seeder
{
    public function run(): void
    {
        Role::query()->updateOrCreate(
            ['code' => 'ADMINISTRADOR'],
            [
                'tenant_organization_id' => null,
                'name' => 'Administrador',
                'description' => 'Rol de sistema con control total sobre usuarios, roles y permisos.',
                'is_system' => true,
                'is_editable' => false,
                'priority_level' => 1,
                'is_active' => true,
            ],
        );

        Role::query()->updateOrCreate(
            ['code' => 'LOGÍSTICA'],
            [
                'tenant_organization_id' => null,
                'name' => 'Logística',
                'description' => 'Rutas, vehículos, conductores y programación de transporte.',
                'is_system' => true,
                'is_editable' => false,
                'priority_level' => 3,
                'is_active' => true,
            ],
        );
    }
}
