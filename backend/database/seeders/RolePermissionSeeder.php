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
        'treatments.read', 'treatments.create', 'treatments.update', 'treatments.activate', 'treatments.deactivate',
        'branch_treatments.read', 'branch_treatments.create', 'branch_treatments.update', 'branch_treatments.activate', 'branch_treatments.deactivate',
        'waste_types.read', 'waste_types.manage',
        'measurement_units.read', 'measurement_units.manage',
        'generation_frequencies.read', 'generation_frequencies.manage',
        'waste_operational_statuses.read', 'waste_operational_statuses.manage',
        'wastes.read', 'wastes.create', 'wastes.update', 'wastes.activate', 'wastes.deactivate',
        'wastes.submit', 'wastes.review', 'wastes.classify', 'wastes.reject',
        'treatment_approvals.read', 'treatment_approvals.create', 'treatment_approvals.update', 'treatment_approvals.evaluate',
        'preapproved_wastes.read', 'preapproved_wastes.manage',
        'workflows.manage',
        'service_requests.read', 'service_requests.create', 'service_requests.update', 'service_requests.cancel', 'service_requests.evaluate',
        'transport_schedules.read', 'transport_schedules.create', 'transport_schedules.update', 'transport_schedules.cancel',
        'transport_personnel.read', 'transport_personnel.create', 'transport_personnel.update',
        'transport_routes.read', 'transport_routes.create',
        'manifest_loads.read', 'manifest_loads.create', 'manifest_loads.update', 'manifest_loads.sign', 'manifest_loads.cancel',
        'branch_locations.read', 'branch_locations.create', 'branch_locations.update',
        'unload_requests.read', 'unload_requests.create', 'unload_requests.update', 'unload_requests.decide',
        'plant_reception_schedules.read', 'plant_reception_schedules.manage',
        'gestor_carrier_authorizations.read', 'gestor_carrier_authorizations.create', 'gestor_carrier_authorizations.revoke',
    ];

    /**
     * LOGÍSTICA (CU-051, 2026-07-16) es SOLO de lectura sobre vehículos --
     * decisión ya confirmada por el usuario, no un descuido: "los
     * coordinadores de logística también pueden ver los vehículos de su
     * organización" (ver, no crear/editar).
     *
     * `transport_schedules.*` (revisión de seguridad Programación/Dispatch,
     * 2026-07-19, hallazgo Alto CONFIRMADO por el usuario): sin estos 4
     * permisos, un usuario con SOLO el rol de sistema `LOGÍSTICA` (sin
     * `ADMINISTRADOR`) quedaba bloqueado en TODO el ciclo de
     * `TransportScheduleController` -- `TransportSchedulePolicy` exige
     * `hasPermission('transport_schedules.*')` en cada método, y
     * `TransportScheduleWorkflowSeeder` YA autoriza las transiciones
     * humanas (`submit()`/`confirm()`/`cancel()`) contra el rol `LOGÍSTICA`
     * -- el rol tenía la autorización de WORKFLOW pero no el permiso base
     * de la Policy, un bloqueo funcional real, no solo un hallazgo teórico.
     *
     * `transport_personnel.read` (gap real de contrato, 2026-07-19): mismo
     * criterio EXACTO que `vehicles.read` -- LOGÍSTICA consulta los
     * conductores de su organización, pero NO los crea/edita (eso queda
     * SOLO en ADMINISTRADOR, igual que con vehículos). `transport_routes.read`/
     * `.create` SÍ se asignan completos (a diferencia de `transport_personnel`):
     * a diferencia de vehículos/conductores (recursos de flota, datos
     * maestros), las rutas son parte de la coordinación ACTIVA del día a día
     * de LOGÍSTICA -- mismo criterio que su acceso completo a
     * `transport_schedules.*`, con el que las rutas se usan en conjunto vía
     * `assignToRoute()`.
     *
     * `manifest_loads.*` (Módulo Manifiesto de Cargue, Fase 3, 2026-07-20):
     * acceso COMPLETO (los 5 códigos), mismo criterio que
     * `transport_schedules.*` -- LOGÍSTICA es el mismo actor que ya crea/
     * gestiona la programación de transporte de la que se deriva el
     * manifiesto. `manifest_loads.sign` se incluye a propósito: la
     * autorización real de "quién puede firmar como generador/conductor" NO
     * depende del ROL del actor sino de a qué ORGANIZACIÓN pertenece
     * (`ManifestLoadSignatureService::assertActorCanSign()`, ver su
     * docblock) -- así que un usuario con rol LOGÍSTICA perteneciente a la
     * organización Generadora puede firmar como generador, y uno
     * perteneciente a la Transportadora puede firmar como conductor, con el
     * MISMO permiso base. FLAG explícito (gap real, no resuelto en este
     * lote): el catálogo canónico de 9 roles todavía solo tiene 2 sembrados
     * (ADMINISTRADOR/LOGÍSTICA) -- no existe un rol de sistema dedicado al
     * lado Generador; hasta que se siembre uno, cualquier actor del lado
     * Generador que necesite firmar debe tener asignado ADMINISTRADOR o
     * LOGÍSTICA.
     *
     * `unload_requests.*`/`plant_reception_schedules.*` (Fase 4 "Cita de
     * Recepción en Planta", D-PRG-02/D-PRG-13): acceso COMPLETO, mismo FLAG
     * documentado arriba para `manifest_loads.sign` -- ambos lados
     * (transportador Y receptor) usan el MISMO rol de sistema LOGÍSTICA
     * hasta que existan roles dedicados por lado; la restricción fina de
     * "qué organización concreta" vive en `UnloadRequestPolicy`/
     * `PlantReceptionSchedulePolicy` (acceso dual por organización), no en
     * el catálogo de permisos. `branch_locations.*` NO se asigna a
     * LOGÍSTICA -- mismo criterio que `branches.*` (gestión de sedes/muelles
     * queda SOLO en ADMINISTRADOR).
     *
     * `gestor_carrier_authorizations.*` (revisión especialista-seguridad,
     * "Modalidad 3"): acceso COMPLETO -- LOGÍSTICA ya gestiona toda la
     * relación de transporte (`transport_schedules.*`), autorizar/revocar un
     * transportador independiente es parte de la misma coordinación.
     */
    private const LOGISTICA_PERMISSION_CODES = [
        'vehicles.read',
        'transport_schedules.read', 'transport_schedules.create', 'transport_schedules.update', 'transport_schedules.cancel',
        'transport_personnel.read',
        'transport_routes.read', 'transport_routes.create',
        'manifest_loads.read', 'manifest_loads.create', 'manifest_loads.update', 'manifest_loads.sign', 'manifest_loads.cancel',
        'unload_requests.read', 'unload_requests.create', 'unload_requests.update', 'unload_requests.decide',
        'plant_reception_schedules.read', 'plant_reception_schedules.manage',
        'gestor_carrier_authorizations.read', 'gestor_carrier_authorizations.create', 'gestor_carrier_authorizations.revoke',
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
