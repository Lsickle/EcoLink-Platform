<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use Illuminate\Database\Seeder;

/**
 * Matriz CRUD (módulo Usuarios y Seguridad): ADMINISTRADOR = CRUD completo
 * + ASS (assign) en Usuarios, Roles y Permisos.
 *
 * DECISIÓN CONFIRMADA (2026-07-14, por el usuario del proyecto, no por
 * asunción del agente): `audit.read`/`audit.export` SÍ se asignan a
 * ADMINISTRADOR. La Matriz CRUD revisada en el lote original de RBAC no
 * tenía una fila que lo confirmara explícitamente, pero la descripción de
 * rol de ADMINISTRADOR ("control total sobre usuarios, roles y permisos")
 * y el hecho de que sin esto nadie puede ver la pestaña Auditoría de
 * ningún rol lo hacían necesario. El usuario lo confirmó explícitamente.
 */
class RolePermissionSeeder extends Seeder
{
    private const ADMINISTRADOR_PERMISSION_CODES = [
        'users.create', 'users.read', 'users.update', 'users.delete', 'users.activate', 'users.deactivate', 'users.reset-password',
        'roles.create', 'roles.read', 'roles.update', 'roles.delete', 'roles.assign',
        'permissions.read', 'permissions.assign',
        'audit.read', 'audit.export',
        'waste_streams.read', 'waste_streams.manage',
        'un_codes.read', 'un_codes.manage',
        'geography.read', 'geography.manage',
        'branch_types.read', 'branch_types.manage',
        'organizational_areas.read', 'organizational_areas.manage',
        'hazard_characteristics.read', 'hazard_characteristics.manage',
        'waste_categories.read', 'waste_categories.manage',
        'physical_states.read', 'physical_states.manage',
        'packaging_types.read', 'packaging_types.manage',
        'packaging_conditions.read', 'packaging_conditions.manage',
        'vehicle_types.read', 'vehicle_types.manage',
        'contacts.read', 'contacts.create', 'contacts.update',
        'branches.read', 'branches.create', 'branches.update', 'branches.activate', 'branches.deactivate',
        'vehicles.read', 'vehicles.create', 'vehicles.update', 'vehicles.activate', 'vehicles.deactivate',
    ];

    /**
     * LOGÍSTICA (CU-051, 2026-07-16) es SOLO de lectura sobre vehículos --
     * decisión ya confirmada por el usuario, no un descuido: "los
     * coordinadores de logística también pueden ver los vehículos de su
     * organización" (ver, no crear/editar).
     */
    private const LOGISTICA_PERMISSION_CODES = [
        'vehicles.read',
    ];

    public function run(): void
    {
        $administrador = Role::query()->where('code', 'ADMINISTRADOR')->firstOrFail();
        $this->assignPermissions($administrador, self::ADMINISTRADOR_PERMISSION_CODES);

        $logistica = Role::query()->where('code', 'LOGÍSTICA')->firstOrFail();
        $this->assignPermissions($logistica, self::LOGISTICA_PERMISSION_CODES);
    }

    /**
     * @param  list<string>  $codes
     */
    private function assignPermissions(Role $role, array $codes): void
    {
        $permissionIds = Permission::query()
            ->whereIn('code', $codes)
            ->pluck('id', 'code');

        foreach ($codes as $code) {
            $permissionId = $permissionIds->get($code);

            if ($permissionId === null) {
                continue;
            }

            RolePermission::query()->updateOrCreate(
                ['role_id' => $role->id, 'permission_id' => $permissionId],
                ['is_active' => true],
            );
        }
    }
}
