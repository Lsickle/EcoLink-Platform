<?php

use App\Models\Permission;
use App\Models\Role;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\RoleSeeder;

// Módulo Usuarios y Seguridad -- primer lote RBAC. Alcance confirmado:
// solo se siembra el rol ADMINISTRADOR (los otros 8 roles del catálogo
// canónico, incluido AUDITOR, quedan fuera de este lote) y el catálogo fijo
// de 16 permisos de Usuarios/Roles/Permisos/Auditoría (15 originales +
// `users.deactivate`, separado de `users.activate` en el lote 3 -- hallazgo
// Medio de especialista-seguridad, mínimo privilegio). Desde 2026-07-14,
// ADMINISTRADOR también queda con `audit.read`/`audit.export` -- confirmado
// explícitamente por el usuario del proyecto (ver cabecera de
// RolePermissionSeeder). Desde 2026-07-15 (primer módulo real del dominio
// Residuos), el catálogo crece a 20 permisos con `waste_streams.read`/
// `waste_streams.manage`/`un_codes.read`/`un_codes.manage`, también
// asignados a ADMINISTRADOR. Batch 1/3 de Catálogos Maestros (mismo día):
// crece a 26 permisos con `geography.read`/`geography.manage`/
// `branch_types.read`/`branch_types.manage`/`organizational_areas.read`/
// `organizational_areas.manage` -- GAP señalado al hilo principal (sin
// `Catálogo de Permisos.md` disponible en esta sesión, códigos nuevos
// creados por consistencia con el patrón `.read`/`.manage` ya establecido,
// no por confirmación de negocio). Batch 2/3 de Catálogos Maestros (RESPEL,
// mismo día): crece a 32 permisos con `hazard_characteristics.read`/
// `hazard_characteristics.manage`/`waste_categories.read`/
// `waste_categories.manage`/`physical_states.read`/`physical_states.manage`
// -- mismo GAP, mismo patrón. Batch 3/3 (último) de Catálogos Maestros
// (mismo día): crece a 38 permisos con `packaging_types.read`/
// `packaging_types.manage`/`packaging_conditions.read`/
// `packaging_conditions.manage`/`vehicle_types.read`/`vehicle_types.manage`
// -- mismo GAP, mismo patrón. CRUD de Sedes + Contactos (2026-07-15, mismo
// GAP -- `Catálogo de Permisos.md` no cubre `branches`/`contacts`): crece a
// 46 permisos con `contacts.read`/`contacts.create`/`contacts.update` (sin
// `.delete`, criterio "solo revocar") y `branches.read`/`branches.create`/
// `branches.update`/`branches.activate`/`branches.deactivate`. CRUD de
// Vehículos (CU-051, 2026-07-16, mismo GAP de nomenclatura -- ver docblock
// de `PermissionSeeder`): crece a 51 permisos con `vehicles.read`/
// `vehicles.create`/`vehicles.update`/`vehicles.activate`/
// `vehicles.deactivate`. Este lote también siembra el segundo rol del
// catálogo canónico, `LOGÍSTICA` (rol #7 de 9), SOLO con `vehicles.read`
// (decisión ya confirmada: "los coordinadores de logística también pueden
// ver los vehículos de su organización" -- ver, no crear/editar). Módulo
// Tratamiento (RN-063/D-R02, 2026-07-17, mismo GAP -- ver docblock de
// `PermissionSeeder`): crece a 61 permisos con `treatments.read`/
// `treatments.create`/`treatments.update`/`treatments.activate`/
// `treatments.deactivate` y `branch_treatments.read`/`.create`/`.update`/
// `.activate`/`.deactivate`. Núcleo del Módulo Residuos (2026-07-18, mismo
// GAP -- ver docblock de `PermissionSeeder`): crece a 78 permisos con
// `waste_types.read`/`.manage`, `measurement_units.read`/`.manage`,
// `generation_frequencies.read`/`.manage`, `waste_operational_statuses.read`/
// `.manage` (4 catálogos maestros nuevos) y `wastes.read`/`.create`/
// `.update`/`.activate`/`.deactivate`/`.submit`/`.review`/`.classify`/
// `.reject` (CRUD + workflow de declaración). "Evaluación del Gestor"
// (`waste_treatment_approvals`, 2026-07-19, mismo GAP -- ver docblock de
// `PermissionSeeder`): crece a 82 permisos con `treatment_approvals.read`/
// `.create`/`.update`/`.evaluate`. "Residuos Preaprobados" (2026-07-19,
// mismo GAP): crece a 84 permisos con `preapproved_wastes.read`/`.manage`.
// CU-021 "Configurar Workflow" (2026-07-20, hallazgo especialista-seguridad):
// crece a 85 permisos con el permiso ÚNICO `workflows.manage`. Módulo
// Solicitudes de Servicio, Fase 1b (2026-07-19, mismo GAP): crece a 90
// permisos con `service_requests.read`/`.create`/`.update`/`.cancel`/
// `.evaluate`. Módulo Programación Logística, Fase 2a (2026-07-19, mismo
// GAP): crece a 94 permisos con `transport_schedules.read`/`.create`/
// `.update`/`.cancel`. Gap real de contrato detectado por el agente de
// frontend (2026-07-19, mismo GAP): crece a 99 permisos con
// `transport_personnel.read`/`.create`/`.update` y
// `transport_routes.read`/`.create`. Módulo Manifiesto de Cargue, Fase 3
// (2026-07-20, mismo GAP): crece a 104 permisos con `manifest_loads.read`/
// `.create`/`.update`/`.sign`/`.cancel`. Fase 4 "Cita de Recepción en
// Planta (bilateral)" (2026-07-21, mismo GAP): crece a 113 permisos con
// `branch_locations.read`/`.create`/`.update`, `unload_requests.read`/
// `.create`/`.update`/`.decide` y `plant_reception_schedules.read`/`.manage`.
// "Modalidad 3" (revisión especialista-seguridad, 2026-07-21, mismo GAP):
// crece a 116 permisos con `gestor_carrier_authorizations.read`/`.create`/
// `.revoke`. ADMINISTRADOR queda con los 116 permisos del catálogo completo.

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->seed(RolePermissionSeeder::class);
});

test('siembra exactamente 116 permisos con los códigos exactos del catálogo', function () {
    expect(Permission::query()->count())->toBe(116);

    $expectedCodes = [
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

    expect(Permission::query()->pluck('code')->sort()->values()->all())
        ->toBe(collect($expectedCodes)->sort()->values()->all());
});

test('los permisos sembrados son un catálogo global (tenant_organization_id nulo) y activo', function () {
    expect(Permission::query()->whereNotNull('tenant_organization_id')->exists())->toBeFalse()
        ->and(Permission::query()->where('is_active', false)->exists())->toBeFalse()
        ->and(Permission::query()->where('is_system', false)->exists())->toBeFalse();
});

test('governance.view y security.view NUNCA se siembran (D-U12)', function () {
    expect(Permission::query()->whereIn('code', ['governance.view', 'security.view'])->exists())->toBeFalse();
});

test('siembra ADMINISTRADOR y LOGÍSTICA (los otros 7 roles del catálogo canónico quedan fuera de este lote)', function () {
    expect(Role::query()->count())->toBe(2);

    $administrador = Role::query()->where('code', 'ADMINISTRADOR')->first();
    expect($administrador)->not->toBeNull()
        ->and($administrador->is_system)->toBeTrue()
        ->and($administrador->tenant_organization_id)->toBeNull();

    $logistica = Role::query()->where('code', 'LOGÍSTICA')->first();
    expect($logistica)->not->toBeNull()
        ->and($logistica->is_system)->toBeTrue()
        ->and($logistica->tenant_organization_id)->toBeNull();
});

test('ADMINISTRADOR queda con todos los permisos de Usuarios, Roles, Permisos, Auditoría, Corrientes de Residuos, Códigos UN, Catálogos Maestros (geografía/tipos de sede/áreas organizacionales/características de peligrosidad/categorías de residuo/estados físicos/tipos de embalaje/estados del embalaje/tipos de vehículo), Sedes + Contactos, Vehículos, Tratamiento (tratamientos + tratamientos por sede), núcleo del Módulo Residuos (tipos de residuo/unidades de medida/frecuencias de generación/estados operativos + CRUD/workflow de residuos) y Evaluación del Gestor (waste_treatment_approvals)', function () {
    $administrador = Role::query()->where('code', 'ADMINISTRADOR')->firstOrFail();

    $codes = $administrador->permissions()->pluck('code')->sort()->values()->all();

    $expected = collect([
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
    ])->sort()->values()->all();

    expect($codes)->toBe($expected);
});

/**
 * Hallazgo Alto (revisión de seguridad Programación/Dispatch, 2026-07-19,
 * decisión confirmada por el usuario): `transport_schedules.*` se agrega a
 * LOGÍSTICA -- sin esto, un usuario con SOLO este rol quedaba bloqueado en
 * TODO el ciclo de `TransportScheduleController`, pese a que
 * `TransportScheduleWorkflowSeeder` YA lo autorizaba como actor de workflow
 * (ver `TransportScheduleControllerTest`, "un actor con SOLO el rol
 * LOGÍSTICA real..."). `transport_personnel.read` (mismo criterio que
 * `vehicles.read`, solo lectura) y `transport_routes.read`/`.create`
 * (completo, mismo criterio que `transport_schedules.*`) se agregan en el
 * mismo lote que resuelve el gap real de contrato señalado por el agente de
 * frontend -- ver docblock de `RolePermissionSeeder::LOGISTICA_PERMISSION_CODES`.
 */
test('LOGÍSTICA queda con vehicles.read + transport_personnel.read (solo lectura) + transport_schedules.*/transport_routes.*/manifest_loads.*/unload_requests.*/plant_reception_schedules.* completos', function () {
    $logistica = Role::query()->where('code', 'LOGÍSTICA')->firstOrFail();

    $codes = $logistica->permissions()->pluck('code')->sort()->values()->all();

    expect($codes)->toBe(collect([
        'vehicles.read',
        'transport_schedules.read', 'transport_schedules.create', 'transport_schedules.update', 'transport_schedules.cancel',
        'transport_personnel.read',
        'transport_routes.read', 'transport_routes.create',
        'manifest_loads.read', 'manifest_loads.create', 'manifest_loads.update', 'manifest_loads.sign', 'manifest_loads.cancel',
        'unload_requests.read', 'unload_requests.create', 'unload_requests.update', 'unload_requests.decide',
        'plant_reception_schedules.read', 'plant_reception_schedules.manage',
        'gestor_carrier_authorizations.read', 'gestor_carrier_authorizations.create', 'gestor_carrier_authorizations.revoke',
    ])->sort()->values()->all());
});

test('ADMINISTRADOR queda con los permisos de auditoría (audit.read/audit.export) -- confirmado explícitamente por el usuario 2026-07-14', function () {
    $administrador = Role::query()->where('code', 'ADMINISTRADOR')->firstOrFail();

    $codes = $administrador->permissions()->pluck('code')->all();

    expect($codes)->toContain('audit.read')
        ->and($codes)->toContain('audit.export');
});

test('marca is_critical=true solo en los 5 permisos confirmados por el usuario (users.deactivate queda fuera)', function () {
    $expectedCritical = [
        'users.delete',
        'roles.delete',
        'users.reset-password',
        'roles.assign',
        'permissions.assign',
    ];

    expect(Permission::query()->where('is_critical', true)->pluck('code')->sort()->values()->all())
        ->toBe(collect($expectedCritical)->sort()->values()->all());

    expect(Permission::query()->where('is_critical', false)->count())->toBe(116 - count($expectedCritical));
});

test('los seeders son idempotentes (correr dos veces no duplica filas)', function () {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->seed(RolePermissionSeeder::class);

    expect(Permission::query()->count())->toBe(116)
        ->and(Role::query()->count())->toBe(2)
        ->and(Role::query()->where('code', 'ADMINISTRADOR')->firstOrFail()->permissions()->count())->toBe(116)
        ->and(Role::query()->where('code', 'LOGÍSTICA')->firstOrFail()->permissions()->count())->toBe(22);
});
