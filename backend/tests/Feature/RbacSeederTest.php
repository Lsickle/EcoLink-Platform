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
// ver los vehículos de su organización" -- ver, no crear/editar).
// ADMINISTRADOR queda con los 51 permisos del catálogo completo.

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->seed(RolePermissionSeeder::class);
});

test('siembra exactamente 51 permisos con los códigos exactos del catálogo', function () {
    expect(Permission::query()->count())->toBe(51);

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

test('ADMINISTRADOR queda con todos los permisos de Usuarios, Roles, Permisos, Auditoría, Corrientes de Residuos, Códigos UN, Catálogos Maestros (geografía/tipos de sede/áreas organizacionales/características de peligrosidad/categorías de residuo/estados físicos/tipos de embalaje/estados del embalaje/tipos de vehículo), Sedes + Contactos y Vehículos', function () {
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
    ])->sort()->values()->all();

    expect($codes)->toBe($expected);
});

test('LOGÍSTICA queda SOLO con vehicles.read (solo lectura sobre vehículos)', function () {
    $logistica = Role::query()->where('code', 'LOGÍSTICA')->firstOrFail();

    $codes = $logistica->permissions()->pluck('code')->sort()->values()->all();

    expect($codes)->toBe(['vehicles.read']);
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

    expect(Permission::query()->where('is_critical', false)->count())->toBe(51 - count($expectedCritical));
});

test('los seeders son idempotentes (correr dos veces no duplica filas)', function () {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->seed(RolePermissionSeeder::class);

    expect(Permission::query()->count())->toBe(51)
        ->and(Role::query()->count())->toBe(2)
        ->and(Role::query()->where('code', 'ADMINISTRADOR')->firstOrFail()->permissions()->count())->toBe(51)
        ->and(Role::query()->where('code', 'LOGÍSTICA')->firstOrFail()->permissions()->count())->toBe(1);
});
