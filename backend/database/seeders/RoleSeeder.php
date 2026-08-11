<?php

namespace Database\Seeders;

use App\Models\Role;
use Illuminate\Database\Seeder;

/**
 * roles-canonicos.md (eje 1, RBAC): catálogo global de 9 roles vigentes.
 * Alcance confirmado del lote original (RBAC Usuarios/Roles/Permisos): SOLO
 * se sembró ADMINISTRADOR -- los demás quedaban documentados en el catálogo
 * canónico pero sin sembrar por decisión explícita (sin permisos reales
 * definidos todavía). Se fueron sembrando incrementalmente conforme cada
 * módulo los necesitó (mismo criterio: solo con los permisos YA reales de
 * ese módulo, sin completar su eventual alcance en el resto de la app):
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
 *
 * `TECNICO_AMBIENTAL` (rol #5) y `OPERACIONES` (rol #6) (verificación
 * RBAC/privacidad del módulo Residuos, 2026-08-09): mismo patrón, SOLO con
 * los permisos de `wastes.*`/`treatment_approvals.*`/`preapproved_wastes.*`
 * -- ver RolePermissionSeeder para el reparto exacto (declaración universal
 * vs. evaluación exclusiva de Gestor).
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

        // Verificación de RBAC/privacidad por rol de negocio (2026-08-09):
        // sin estos dos roles, CUALQUIER usuario que opera el módulo de
        // Residuos (sin importar el business_role de su organización)
        // necesitaba el rol ADMINISTRADOR completo -- que también trae
        // users.reset-password/roles.assign/permissions.assign sobre su
        // propia organización, un sobre-privilegio real (hallazgo Alto de
        // especialista-seguridad). `TECNICO_AMBIENTAL` es rol #5 y
        // `OPERACIONES` rol #6 del catálogo canónico de 9
        // (roles-canonicos.md) -- ya documentados ahí, nunca sembrados. Se
        // siembran ahora SOLO con los permisos del módulo Residuos (mismo
        // criterio incremental ya usado para ADMINISTRADOR/LOGÍSTICA -- no
        // se completa su eventual alcance en otros módulos todavía, ver
        // RolePermissionSeeder).
        Role::query()->updateOrCreate(
            ['code' => 'TECNICO_AMBIENTAL'],
            [
                'tenant_organization_id' => null,
                'name' => 'Técnico Ambiental',
                'description' => 'Evaluación técnica y comercial de tratamientos de residuos -- de EcoLink o de cualquier organización Gestor.',
                'is_system' => true,
                'is_editable' => false,
                'priority_level' => 2,
                'is_active' => true,
            ],
        );

        Role::query()->updateOrCreate(
            ['code' => 'OPERACIONES'],
            [
                'tenant_organization_id' => null,
                'name' => 'Operaciones',
                'description' => 'Ejecución/control de servicios operativos -- de EcoLink o de cualquier organización partner.',
                'is_system' => true,
                'is_editable' => false,
                'priority_level' => 4,
                'is_active' => true,
            ],
        );
    }
}
