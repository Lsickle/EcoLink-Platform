<?php

namespace Database\Seeders;

use App\Models\Permission;
use Illuminate\Database\Seeder;

/**
 * Catálogo de Permisos.md, módulo Seguridad -- catálogo fijo sembrado por
 * código (CU-008 "Gestionar Permisos" es de solo lectura desde la UI/API:
 * no hay POST/PUT/DELETE de permisos, ver PermissionController). Códigos
 * preservados EXACTAMENTE tal como están documentados -- no reinterpretar.
 *
 * `governance.view`/`security.view` se excluyen a propósito (D-U12: son
 * cargos del eje 3 -- positions --, no permisos RBAC reales).
 *
 * `is_critical` (confirmado con el usuario, lote 2): marca los 5 permisos
 * de mayor impacto (borrado y acciones de asignación/reinicio de
 * credenciales) -- el resto (create/read/update/activate/deactivate) queda
 * en `false`. Alimenta el `risk_level` calculado de RoleController::show().
 *
 * `users.activate`/`users.deactivate` (hallazgo Medio, especialista-
 * seguridad, 2026-07-13, lote 3): antes un solo permiso `users.activate`
 * cubría ambas direcciones, violando mínimo privilegio -- se separan en dos
 * códigos nuevos (16 permisos en total). `users.deactivate` NO se marca
 * `is_critical` -- mismo criterio que el `users.activate` original (no
 * estaba en la lista de 5 confirmada por el usuario); es una decisión de
 * este lote, ajustable si el negocio lo pide.
 *
 * `priority_level` (confirmado con el usuario, cierre de brecha CRUD de
 * Permisos vs. Figma): 1=Bajo, 2=Medio, 3=Alto, 4=Crítico -- mapeo EXACTO,
 * independiente de `is_critical` (p. ej. `users.reset-password` es
 * `is_critical=true` pero `priority_level=3`, no 4).
 *
 * `geography.*`/`branch_types.*`/`organizational_areas.*` (Batch 1/3 de
 * Catálogos Maestros, 2026-07-15): GAP señalado explícitamente al hilo
 * principal -- no existía ningún permiso para estos 3 catálogos antes de
 * este lote (`Catálogo de Permisos.md` no fue consultado, sin acceso al
 * repo de documentación en esta sesión). Se siguió el MISMO patrón exacto
 * ya usado por `waste_streams`/`un_codes` (un `.read` + un `.manage` por
 * catálogo, `.manage` cubre create/update/activate/deactivate) por
 * consistencia de código, NO por confirmación de negocio -- pendiente de
 * validar contra el catálogo canónico cuando esté disponible.
 *
 * `hazard_characteristics.*`/`waste_categories.*`/`physical_states.*`
 * (Batch 2/3 de Catálogos Maestros, RESPEL, 2026-07-15): mismo GAP y mismo
 * patrón que el aviso anterior -- 3 catálogos nuevos sin permiso previo,
 * sembrados con el mismo esquema `.read`/`.manage` por consistencia de
 * código, no por confirmación de negocio.
 *
 * `packaging_types.*`/`packaging_conditions.*`/`vehicle_types.*` (Batch 3/3
 * -- último -- de Catálogos Maestros, 2026-07-15): mismo GAP y mismo patrón
 * que los avisos anteriores -- 3 catálogos nuevos sin permiso previo,
 * sembrados con el mismo esquema `.read`/`.manage` por consistencia de
 * código, no por confirmación de negocio. `packaging_conditions`/
 * `vehicle_types` además tienen datos PROVISIONALES (ver AVISO en sus
 * seeders/migraciones) -- el nombre del permiso no depende de eso, solo se
 * señala aquí por completitud.
 *
 * `contacts.*`/`branches.*` (CRUD de Sedes + Contactos, 2026-07-15): mismo
 * GAP declarado explícitamente -- el catálogo de permisos hoy NO cubre
 * `branches`/`contacts` (confirmado, plan de este lote). `contacts` sigue el
 * criterio "solo revocar" (SIN `.delete`, igual que el resto del catálogo:
 * `.read`/`.create`/`.update`). `branches` además separa `.activate`/
 * `.deactivate` de `.update` (mismo criterio granular ya usado en
 * `users.activate`/`users.deactivate`) -- ninguno de los dos grupos es
 * `is_critical`.
 *
 * `vehicles.*` (CRUD de Vehículos, CU-051, 2026-07-16): el catálogo de
 * permisos usa el plural "vehicles" (consistente con el resto de módulos ya
 * sembrados) aunque las specs CU citan el singular `vehicle.*` -- gap de
 * nomenclatura YA CONOCIDO del proyecto (ver `Catálogo de Permisos.md`), no
 * se repite aquí. Mismo criterio granular que `branches.*`: `.activate`/
 * `.deactivate` separados de `.update`. Ninguno es `is_critical`.
 */
class PermissionSeeder extends Seeder
{
    private const CRITICAL_CODES = [
        'users.delete',
        'roles.delete',
        'users.reset-password',
        'roles.assign',
        'permissions.assign',
    ];

    /** @var array<int, list<string>> */
    private const PRIORITY_LEVELS = [
        1 => ['users.read', 'roles.read', 'permissions.read', 'audit.read', 'waste_streams.read', 'un_codes.read', 'geography.read', 'branch_types.read', 'organizational_areas.read', 'hazard_characteristics.read', 'waste_categories.read', 'physical_states.read', 'packaging_types.read', 'packaging_conditions.read', 'vehicle_types.read', 'contacts.read', 'branches.read', 'vehicles.read'],
        2 => ['users.create', 'users.update', 'users.activate', 'users.deactivate', 'roles.create', 'roles.update', 'audit.export', 'waste_streams.manage', 'un_codes.manage', 'geography.manage', 'branch_types.manage', 'organizational_areas.manage', 'hazard_characteristics.manage', 'waste_categories.manage', 'physical_states.manage', 'packaging_types.manage', 'packaging_conditions.manage', 'vehicle_types.manage', 'contacts.create', 'contacts.update', 'branches.create', 'branches.update', 'branches.activate', 'branches.deactivate', 'vehicles.create', 'vehicles.update', 'vehicles.activate', 'vehicles.deactivate'],
        3 => ['users.reset-password', 'roles.assign', 'permissions.assign'],
        4 => ['users.delete', 'roles.delete'],
    ];

    public function run(): void
    {
        $permissions = [
            ['code' => 'users.create', 'name' => 'Crear usuarios', 'module' => 'users', 'action' => 'create'],
            ['code' => 'users.read', 'name' => 'Consultar usuarios', 'module' => 'users', 'action' => 'read'],
            ['code' => 'users.update', 'name' => 'Modificar usuarios', 'module' => 'users', 'action' => 'update'],
            ['code' => 'users.delete', 'name' => 'Eliminar usuarios', 'module' => 'users', 'action' => 'delete'],
            ['code' => 'users.activate', 'name' => 'Activar usuarios', 'module' => 'users', 'action' => 'activate'],
            ['code' => 'users.deactivate', 'name' => 'Inactivar usuarios', 'module' => 'users', 'action' => 'deactivate'],
            ['code' => 'users.reset-password', 'name' => 'Reiniciar credenciales de usuario', 'module' => 'users', 'action' => 'reset-password'],

            ['code' => 'roles.create', 'name' => 'Crear roles', 'module' => 'roles', 'action' => 'create'],
            ['code' => 'roles.read', 'name' => 'Consultar roles', 'module' => 'roles', 'action' => 'read'],
            ['code' => 'roles.update', 'name' => 'Modificar roles', 'module' => 'roles', 'action' => 'update'],
            ['code' => 'roles.delete', 'name' => 'Eliminar roles', 'module' => 'roles', 'action' => 'delete'],
            ['code' => 'roles.assign', 'name' => 'Asignar roles a usuario', 'module' => 'roles', 'action' => 'assign'],

            ['code' => 'permissions.read', 'name' => 'Consultar catálogo de permisos', 'module' => 'permissions', 'action' => 'read'],
            ['code' => 'permissions.assign', 'name' => 'Asignar permisos a rol', 'module' => 'permissions', 'action' => 'assign'],

            ['code' => 'audit.read', 'name' => 'Consultar auditoría', 'module' => 'audit', 'action' => 'read'],
            ['code' => 'audit.export', 'name' => 'Exportar auditoría', 'module' => 'audit', 'action' => 'export'],

            // Primer módulo real del dominio Residuos (catálogos "Corrientes
            // de Residuos" Y/A y "Códigos UN") -- `manage` cubre crear/
            // editar/activar/inactivar/importar, mismo criterio de
            // simplicidad que `permissions.assign`.
            ['code' => 'waste_streams.read', 'name' => 'Consultar corrientes de residuos', 'module' => 'waste_streams', 'action' => 'read'],
            ['code' => 'waste_streams.manage', 'name' => 'Gestionar corrientes de residuos', 'module' => 'waste_streams', 'action' => 'manage'],
            ['code' => 'un_codes.read', 'name' => 'Consultar códigos UN', 'module' => 'un_codes', 'action' => 'read'],
            ['code' => 'un_codes.manage', 'name' => 'Gestionar códigos UN', 'module' => 'un_codes', 'action' => 'manage'],

            // Batch 1/3 de Catálogos Maestros -- ver aviso de GAP en el
            // docblock de esta clase.
            ['code' => 'geography.read', 'name' => 'Consultar geografía (países/departamentos/municipios/localidades)', 'module' => 'geography', 'action' => 'read'],
            ['code' => 'geography.manage', 'name' => 'Activar/inactivar valores del catálogo geográfico', 'module' => 'geography', 'action' => 'manage'],
            ['code' => 'branch_types.read', 'name' => 'Consultar tipos de sede', 'module' => 'branch_types', 'action' => 'read'],
            ['code' => 'branch_types.manage', 'name' => 'Gestionar tipos de sede', 'module' => 'branch_types', 'action' => 'manage'],
            ['code' => 'organizational_areas.read', 'name' => 'Consultar áreas organizacionales', 'module' => 'organizational_areas', 'action' => 'read'],
            ['code' => 'organizational_areas.manage', 'name' => 'Gestionar áreas organizacionales', 'module' => 'organizational_areas', 'action' => 'manage'],

            // Batch 2/3 de Catálogos Maestros (RESPEL) -- ver aviso de GAP
            // en el docblock de esta clase.
            ['code' => 'hazard_characteristics.read', 'name' => 'Consultar características de peligrosidad', 'module' => 'hazard_characteristics', 'action' => 'read'],
            ['code' => 'hazard_characteristics.manage', 'name' => 'Gestionar características de peligrosidad', 'module' => 'hazard_characteristics', 'action' => 'manage'],
            ['code' => 'waste_categories.read', 'name' => 'Consultar categorías de residuo', 'module' => 'waste_categories', 'action' => 'read'],
            ['code' => 'waste_categories.manage', 'name' => 'Gestionar categorías de residuo', 'module' => 'waste_categories', 'action' => 'manage'],
            ['code' => 'physical_states.read', 'name' => 'Consultar estados físicos', 'module' => 'physical_states', 'action' => 'read'],
            ['code' => 'physical_states.manage', 'name' => 'Gestionar estados físicos', 'module' => 'physical_states', 'action' => 'manage'],

            // Batch 3/3 (último) de Catálogos Maestros -- ver aviso de GAP
            // en el docblock de esta clase. `packaging_conditions`/
            // `vehicle_types` tienen datos PROVISIONALES (ver AVISO en sus
            // seeders/migraciones).
            ['code' => 'packaging_types.read', 'name' => 'Consultar tipos de embalaje', 'module' => 'packaging_types', 'action' => 'read'],
            ['code' => 'packaging_types.manage', 'name' => 'Gestionar tipos de embalaje', 'module' => 'packaging_types', 'action' => 'manage'],
            ['code' => 'packaging_conditions.read', 'name' => 'Consultar estados del embalaje', 'module' => 'packaging_conditions', 'action' => 'read'],
            ['code' => 'packaging_conditions.manage', 'name' => 'Gestionar estados del embalaje', 'module' => 'packaging_conditions', 'action' => 'manage'],
            ['code' => 'vehicle_types.read', 'name' => 'Consultar tipos de vehículo', 'module' => 'vehicle_types', 'action' => 'read'],
            ['code' => 'vehicle_types.manage', 'name' => 'Gestionar tipos de vehículo', 'module' => 'vehicle_types', 'action' => 'manage'],

            // CRUD de Sedes + Contactos vs. Figma -- ver aviso de GAP en el
            // docblock de esta clase.
            ['code' => 'contacts.read', 'name' => 'Consultar contactos de organización', 'module' => 'contacts', 'action' => 'read'],
            ['code' => 'contacts.create', 'name' => 'Vincular contactos a organización', 'module' => 'contacts', 'action' => 'create'],
            ['code' => 'contacts.update', 'name' => 'Modificar vínculos de contacto', 'module' => 'contacts', 'action' => 'update'],

            ['code' => 'branches.read', 'name' => 'Consultar sedes', 'module' => 'branches', 'action' => 'read'],
            ['code' => 'branches.create', 'name' => 'Crear sedes', 'module' => 'branches', 'action' => 'create'],
            ['code' => 'branches.update', 'name' => 'Modificar sedes', 'module' => 'branches', 'action' => 'update'],
            ['code' => 'branches.activate', 'name' => 'Activar sedes', 'module' => 'branches', 'action' => 'activate'],
            ['code' => 'branches.deactivate', 'name' => 'Inactivar sedes', 'module' => 'branches', 'action' => 'deactivate'],

            // CRUD de Vehículos vs. CU-051 -- ver aviso de nomenclatura en
            // el docblock de esta clase.
            ['code' => 'vehicles.read', 'name' => 'Consultar vehículos', 'module' => 'vehicles', 'action' => 'read'],
            ['code' => 'vehicles.create', 'name' => 'Crear vehículos', 'module' => 'vehicles', 'action' => 'create'],
            ['code' => 'vehicles.update', 'name' => 'Modificar vehículos', 'module' => 'vehicles', 'action' => 'update'],
            ['code' => 'vehicles.activate', 'name' => 'Activar vehículos', 'module' => 'vehicles', 'action' => 'activate'],
            ['code' => 'vehicles.deactivate', 'name' => 'Inactivar vehículos', 'module' => 'vehicles', 'action' => 'deactivate'],
        ];

        foreach ($permissions as $permission) {
            Permission::query()->updateOrCreate(
                ['code' => $permission['code']],
                [
                    'tenant_organization_id' => null,
                    'name' => $permission['name'],
                    'module' => $permission['module'],
                    'action' => $permission['action'],
                    'scope' => 'tenant',
                    'is_system' => true,
                    'is_active' => true,
                    'is_critical' => in_array($permission['code'], self::CRITICAL_CODES, true),
                    'priority_level' => $this->priorityLevelFor($permission['code']),
                ],
            );
        }
    }

    private function priorityLevelFor(string $code): int
    {
        foreach (self::PRIORITY_LEVELS as $level => $codes) {
            if (in_array($code, $codes, true)) {
                return $level;
            }
        }

        // No debe alcanzarse -- los 16 códigos del catálogo están cubiertos
        // exhaustivamente arriba; si se agrega un permiso nuevo sin mapearlo,
        // falla explícito en vez de sembrar un priority_level arbitrario.
        throw new \LogicException("Permiso '{$code}' sin priority_level mapeado en PermissionSeeder::PRIORITY_LEVELS.");
    }
}
