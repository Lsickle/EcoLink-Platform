<?php

use App\Models\Organization;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\SecurityLog;
use App\Models\User;
use App\Models\UserRole;

// CU-008 (Gestionar Permisos) -- catálogo fijo de solo lectura + asignación
// permiso<->rol. Gateado por PermissionPolicy -> User::hasPermission()
// + aislamiento cross-tenant en assignToRole (hallazgo Crítico,
// especialista-seguridad 2026-07-13).

function actorWithPermissionGrant(array $codes, ?int $tenantId = null): User
{
    $actor = User::factory()->create(['tenant_organization_id' => $tenantId]);
    $grantRole = Role::factory()->create();

    foreach ($codes as $code) {
        $permission = Permission::query()->firstOrCreate(['code' => $code], [
            'name' => $code, 'module' => explode('.', $code)[0], 'action' => explode('.', $code)[1] ?? $code,
            'scope' => 'tenant', 'is_system' => true, 'is_active' => true,
        ]);
        RolePermission::query()->create(['role_id' => $grantRole->id, 'permission_id' => $permission->id, 'is_active' => true]);
    }

    UserRole::query()->create(['user_id' => $actor->id, 'role_id' => $grantRole->id, 'is_active' => true]);

    return $actor;
}

test('index respeta permissions.read', function () {
    $noPermission = User::factory()->create();
    $this->actingAs($noPermission)->getJson('/api/admin/permissions')->assertForbidden();

    $reader = actorWithPermissionGrant(['permissions.read']);
    $this->actingAs($reader)->getJson('/api/admin/permissions')->assertOk();
});

test('assignToRole respeta permissions.assign y crea la fila en role_permissions', function () {
    $permission = Permission::factory()->create(['code' => 'wastes.read']);
    $targetRole = Role::factory()->create();

    $noPermission = User::factory()->create();
    $this->actingAs($noPermission)->postJson("/api/admin/permissions/{$permission->id}/assign", ['role_id' => $targetRole->id])
        ->assertForbidden();

    $actor = actorWithPermissionGrant(['permissions.assign']);
    $this->actingAs($actor)->postJson("/api/admin/permissions/{$permission->id}/assign", ['role_id' => $targetRole->id])
        ->assertOk();

    expect(RolePermission::query()->where('role_id', $targetRole->id)->where('permission_id', $permission->id)->where('is_active', true)->exists())->toBeTrue()
        ->and(SecurityLog::query()->where('event_type', 'PERMISSION_ASSIGNED')->exists())->toBeTrue();
});

test('assignToRole es idempotente -- reasignar el mismo permiso no duplica la fila', function () {
    $permission = Permission::factory()->create();
    $targetRole = Role::factory()->create();
    $actor = actorWithPermissionGrant(['permissions.assign']);

    $this->actingAs($actor)->postJson("/api/admin/permissions/{$permission->id}/assign", ['role_id' => $targetRole->id])->assertOk();
    $this->actingAs($actor)->postJson("/api/admin/permissions/{$permission->id}/assign", ['role_id' => $targetRole->id])->assertOk();

    expect(RolePermission::query()->where('role_id', $targetRole->id)->where('permission_id', $permission->id)->count())->toBe(1);
});

test('index expone module/action/is_critical (lote 2, wizard frontend)', function () {
    Permission::factory()->create(['code' => 'z.first', 'module' => 'zetas', 'action' => 'read', 'is_critical' => true]);

    $actor = actorWithPermissionGrant(['permissions.read']);

    $response = $this->actingAs($actor)->getJson('/api/admin/permissions')->assertOk();

    $row = collect($response->json('data'))->firstWhere('code', 'z.first');
    expect($row)->not->toBeNull()
        ->and($row['module'])->toBe('zetas')
        ->and($row['action'])->toBe('read')
        ->and($row['is_critical'])->toBeTrue();
});

test('no existen endpoints de create/update/delete para el catálogo de permisos (CU-008 confirmado de solo lectura)', function () {
    $actor = actorWithPermissionGrant(['permissions.read', 'permissions.assign']);

    // 405, no 404: la URI existe (GET /admin/permissions), pero POST no
    // tiene ruta registrada -- confirma que no hay endpoint de creación.
    $this->actingAs($actor)->postJson('/api/admin/permissions', ['code' => 'nuevo.permiso'])->assertMethodNotAllowed();
});

// ---- Hallazgo Crítico (especialista-seguridad, 2026-07-13): aislamiento cross-tenant ----

test('assignToRole rechaza (422) un role_id que pertenece EXPLÍCITAMENTE a OTRO tenant', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $permission = Permission::factory()->create();
    $roleOtherTenant = Role::factory()->create(['tenant_organization_id' => $orgB->id]);

    $actor = actorWithPermissionGrant(['permissions.assign'], $orgA->id);

    $this->actingAs($actor)->postJson("/api/admin/permissions/{$permission->id}/assign", ['role_id' => $roleOtherTenant->id])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('role_id');

    expect(RolePermission::query()->where('role_id', $roleOtherTenant->id)->where('permission_id', $permission->id)->exists())->toBeFalse();
});

test('assignToRole permite un role_id GLOBAL (tenant_organization_id NULL, catálogo de sistema)', function () {
    $orgA = Organization::factory()->create();

    $permission = Permission::factory()->create();
    $globalRole = Role::factory()->create(['tenant_organization_id' => null, 'is_system' => true]);

    $actor = actorWithPermissionGrant(['permissions.assign'], $orgA->id);

    $this->actingAs($actor)->postJson("/api/admin/permissions/{$permission->id}/assign", ['role_id' => $globalRole->id])
        ->assertOk();

    expect(RolePermission::query()->where('role_id', $globalRole->id)->where('permission_id', $permission->id)->exists())->toBeTrue();
});

// ---- Permission::isAccessibleBy() (especialista-seguridad, 2026-07-14, hallazgo Medio) ----
// Dormido con los datos reales (los 16 permisos sembrados son globales),
// pero el esquema permite un permiso con tenant propio -- se fija el
// comportamiento con datos de prueba explícitos para no depender de que
// nadie recuerde este caso si algún día se siembra un permiso con tenant.

test('index NO expone un permiso que pertenece EXPLÍCITAMENTE a OTRO tenant', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $ownPermission = Permission::factory()->create(['tenant_organization_id' => $orgA->id, 'code' => 'orga.only']);
    $otherPermission = Permission::factory()->create(['tenant_organization_id' => $orgB->id, 'code' => 'orgb.only']);

    $actor = actorWithPermissionGrant(['permissions.read'], $orgA->id);

    $response = $this->actingAs($actor)->getJson('/api/admin/permissions?per_page=100')->assertOk();

    $codes = collect($response->json('data'))->pluck('code');

    expect($codes)->toContain('orga.only')->not->toContain('orgb.only');
});

test('assignToRole rechaza (422) un permiso que pertenece EXPLÍCITAMENTE a OTRO tenant', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $otherTenantPermission = Permission::factory()->create(['tenant_organization_id' => $orgB->id]);
    $ownRole = Role::factory()->create(['tenant_organization_id' => $orgA->id]);

    $actor = actorWithPermissionGrant(['permissions.assign'], $orgA->id);

    $this->actingAs($actor)->postJson("/api/admin/permissions/{$otherTenantPermission->id}/assign", ['role_id' => $ownRole->id])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('permission_id');

    expect(RolePermission::query()->where('role_id', $ownRole->id)->where('permission_id', $otherTenantPermission->id)->exists())->toBeFalse();
});

test('revokeFromRole rechaza (422) un permiso que pertenece EXPLÍCITAMENTE a OTRO tenant', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $otherTenantPermission = Permission::factory()->create(['tenant_organization_id' => $orgB->id]);
    $ownRole = Role::factory()->create(['tenant_organization_id' => $orgA->id]);

    $actor = actorWithPermissionGrant(['permissions.assign'], $orgA->id);

    $this->actingAs($actor)->postJson("/api/admin/permissions/{$otherTenantPermission->id}/revoke", ['role_id' => $ownRole->id])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('permission_id');
});

// ---- Cierre de brecha CRUD de Permisos vs. Figma: filtros/orden de index() ----

function platformOrgActorForPermission(array $codes): User
{
    $platform = Organization::factory()->create(['is_platform_tenant' => true]);

    return actorWithPermissionGrant($codes, $platform->id);
}

test('index filtra por search en code/name', function () {
    Permission::factory()->create(['code' => 'wastes.classify', 'name' => 'Clasificar residuos']);
    Permission::factory()->create(['code' => 'transport.schedule', 'name' => 'Programar transporte']);
    $actor = actorWithPermissionGrant(['permissions.read']);

    $response = $this->actingAs($actor)->getJson('/api/admin/permissions?search=classify')->assertOk();
    $codes = collect($response->json('data'))->pluck('code');
    expect($codes)->toContain('wastes.classify')->not->toContain('transport.schedule');

    $responseByName = $this->actingAs($actor)->getJson('/api/admin/permissions?search=transporte')->assertOk();
    $namesFound = collect($responseByName->json('data'))->pluck('code');
    expect($namesFound)->toContain('transport.schedule')->not->toContain('wastes.classify');
});

test('index filtra por module (igualdad exacta)', function () {
    Permission::factory()->create(['code' => 'wastes.read', 'module' => 'wastes']);
    Permission::factory()->create(['code' => 'roles.read.module.test', 'module' => 'roles']);
    $actor = actorWithPermissionGrant(['permissions.read']);

    $response = $this->actingAs($actor)->getJson('/api/admin/permissions?module=wastes')->assertOk();
    $codes = collect($response->json('data'))->pluck('code');
    expect($codes)->toContain('wastes.read')->not->toContain('roles.read.module.test');
});

test('index filtra por status active/inactive', function () {
    Permission::factory()->create(['code' => 'perm.active.test', 'is_active' => true]);
    Permission::factory()->create(['code' => 'perm.inactive.test', 'is_active' => false]);
    $actor = actorWithPermissionGrant(['permissions.read']);

    $activeCodes = collect($this->actingAs($actor)->getJson('/api/admin/permissions?status=active')->assertOk()->json('data'))->pluck('code');
    expect($activeCodes)->toContain('perm.active.test')->not->toContain('perm.inactive.test');

    $inactiveCodes = collect($this->actingAs($actor)->getJson('/api/admin/permissions?status=inactive')->assertOk()->json('data'))->pluck('code');
    expect($inactiveCodes)->toContain('perm.inactive.test')->not->toContain('perm.active.test');
});

test('index filtra por critical true/false', function () {
    Permission::factory()->create(['code' => 'perm.critical.test', 'is_critical' => true]);
    Permission::factory()->create(['code' => 'perm.noncritical.test', 'is_critical' => false]);
    $actor = actorWithPermissionGrant(['permissions.read']);

    $criticalCodes = collect($this->actingAs($actor)->getJson('/api/admin/permissions?critical=true')->assertOk()->json('data'))->pluck('code');
    expect($criticalCodes)->toContain('perm.critical.test')->not->toContain('perm.noncritical.test');

    $nonCriticalCodes = collect($this->actingAs($actor)->getJson('/api/admin/permissions?critical=false')->assertOk()->json('data'))->pluck('code');
    expect($nonCriticalCodes)->toContain('perm.noncritical.test')->not->toContain('perm.critical.test');
});

test('index ordena por sort/direction (code y priority_level) y rechaza una columna fuera de whitelist sin romperse', function () {
    Permission::factory()->create(['code' => 'zzz.sort.test', 'priority_level' => 1]);
    Permission::factory()->create(['code' => 'aaa.sort.test', 'priority_level' => 9]);
    $actor = actorWithPermissionGrant(['permissions.read']);

    $ascCodes = collect($this->actingAs($actor)->getJson('/api/admin/permissions?sort=code&direction=asc')->assertOk()->json('data'))->pluck('code')->values();
    expect($ascCodes->first())->toBe('aaa.sort.test');

    $descCodes = collect($this->actingAs($actor)->getJson('/api/admin/permissions?sort=code&direction=desc')->assertOk()->json('data'))->pluck('code')->values();
    expect($descCodes->first())->toBe('zzz.sort.test');

    // columna fuera de whitelist -- debe caer al default (code asc), nunca 500.
    $this->actingAs($actor)->getJson('/api/admin/permissions?sort=1)); DROP TABLE permissions; --')->assertOk();
});

test('index expone roles_count solo con asignaciones activas', function () {
    $permission = Permission::factory()->create(['code' => 'perm.roles.count.test']);
    $activeRole = Role::factory()->create();
    $inactiveRole = Role::factory()->create();
    RolePermission::query()->create(['role_id' => $activeRole->id, 'permission_id' => $permission->id, 'is_active' => true]);
    RolePermission::query()->create(['role_id' => $inactiveRole->id, 'permission_id' => $permission->id, 'is_active' => false]);

    $actor = actorWithPermissionGrant(['permissions.read']);

    $response = $this->actingAs($actor)->getJson('/api/admin/permissions')->assertOk();
    $item = collect($response->json('data'))->firstWhere('code', 'perm.roles.count.test');

    expect($item['roles_count'])->toBe(1);
});

// ---- Detalle de Permiso: show() ----

test('show resuelve created_by/updated_by, roles_count y aísla users_impacted_count por tenant', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $creator = User::factory()->create(['username' => 'creador_perm_test']);
    $editor = User::factory()->create(['username' => 'editor_perm_test']);
    $permission = Permission::factory()->create(['created_by' => $creator->id, 'updated_by' => $editor->id]);

    $roleOrgA = Role::factory()->create(['tenant_organization_id' => $orgA->id]);
    RolePermission::query()->create(['role_id' => $roleOrgA->id, 'permission_id' => $permission->id, 'is_active' => true]);
    $userOrgA = User::factory()->create(['tenant_organization_id' => $orgA->id]);
    UserRole::query()->create(['user_id' => $userOrgA->id, 'role_id' => $roleOrgA->id, 'is_active' => true]);

    $roleOrgB = Role::factory()->create(['tenant_organization_id' => $orgB->id]);
    RolePermission::query()->create(['role_id' => $roleOrgB->id, 'permission_id' => $permission->id, 'is_active' => true]);
    $userOrgB = User::factory()->create(['tenant_organization_id' => $orgB->id]);
    UserRole::query()->create(['user_id' => $userOrgB->id, 'role_id' => $roleOrgB->id, 'is_active' => true]);

    $actor = actorWithPermissionGrant(['permissions.read'], $orgA->id);

    $response = $this->actingAs($actor)->getJson("/api/admin/permissions/{$permission->id}")->assertOk();

    $response->assertJsonPath('permission.created_by.id', $creator->id)
        ->assertJsonPath('permission.created_by.username', 'creador_perm_test')
        ->assertJsonPath('permission.updated_by.id', $editor->id)
        ->assertJsonPath('permission.updated_by.username', 'editor_perm_test')
        ->assertJsonPath('permission.roles_count', 2)
        // el conteo de usuarios NO incluye al usuario de orgB.
        ->assertJsonPath('permission.users_impacted_count', 1);
});

test('show: users_impacted_count ve TODOS los tenants cuando el actor es platform staff', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $permission = Permission::factory()->create();

    $roleOrgA = Role::factory()->create(['tenant_organization_id' => $orgA->id]);
    RolePermission::query()->create(['role_id' => $roleOrgA->id, 'permission_id' => $permission->id, 'is_active' => true]);
    $userOrgA = User::factory()->create(['tenant_organization_id' => $orgA->id]);
    UserRole::query()->create(['user_id' => $userOrgA->id, 'role_id' => $roleOrgA->id, 'is_active' => true]);

    $roleOrgB = Role::factory()->create(['tenant_organization_id' => $orgB->id]);
    RolePermission::query()->create(['role_id' => $roleOrgB->id, 'permission_id' => $permission->id, 'is_active' => true]);
    $userOrgB = User::factory()->create(['tenant_organization_id' => $orgB->id]);
    UserRole::query()->create(['user_id' => $userOrgB->id, 'role_id' => $roleOrgB->id, 'is_active' => true]);

    $platformActor = platformOrgActorForPermission(['permissions.read']);

    $this->actingAs($platformActor)->getJson("/api/admin/permissions/{$permission->id}")
        ->assertOk()
        ->assertJsonPath('permission.users_impacted_count', 2);
});

test('show responde 403 sin permissions.read', function () {
    $permission = Permission::factory()->create();
    $noPermission = User::factory()->create();

    $this->actingAs($noPermission)->getJson("/api/admin/permissions/{$permission->id}")->assertForbidden();
});

// ---- GET /admin/permissions/{permission}/roles ----

test('roles() lista solo roles GLOBALES + del propio tenant del actor, con este permiso activo', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $permission = Permission::factory()->create();

    $roleOrgA = Role::factory()->create(['tenant_organization_id' => $orgA->id]);
    RolePermission::query()->create(['role_id' => $roleOrgA->id, 'permission_id' => $permission->id, 'is_active' => true]);

    $roleOrgB = Role::factory()->create(['tenant_organization_id' => $orgB->id]);
    RolePermission::query()->create(['role_id' => $roleOrgB->id, 'permission_id' => $permission->id, 'is_active' => true]);

    $globalRole = Role::factory()->create(['tenant_organization_id' => null]);
    RolePermission::query()->create(['role_id' => $globalRole->id, 'permission_id' => $permission->id, 'is_active' => true]);

    // rol de orgA con asignación INACTIVA -- no debe aparecer.
    $inactiveRole = Role::factory()->create(['tenant_organization_id' => $orgA->id]);
    RolePermission::query()->create(['role_id' => $inactiveRole->id, 'permission_id' => $permission->id, 'is_active' => false]);

    $actor = actorWithPermissionGrant(['permissions.read'], $orgA->id);

    $response = $this->actingAs($actor)->getJson("/api/admin/permissions/{$permission->id}/roles")->assertOk();

    $ids = collect($response->json('data'))->pluck('id');
    expect($ids)->toContain($roleOrgA->id)
        ->toContain($globalRole->id)
        ->not->toContain($roleOrgB->id)
        ->not->toContain($inactiveRole->id);
});

test('roles() ve todos los tenants cuando el actor es platform staff', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $permission = Permission::factory()->create();

    $roleOrgA = Role::factory()->create(['tenant_organization_id' => $orgA->id]);
    RolePermission::query()->create(['role_id' => $roleOrgA->id, 'permission_id' => $permission->id, 'is_active' => true]);

    $roleOrgB = Role::factory()->create(['tenant_organization_id' => $orgB->id]);
    RolePermission::query()->create(['role_id' => $roleOrgB->id, 'permission_id' => $permission->id, 'is_active' => true]);

    $platformActor = platformOrgActorForPermission(['permissions.read']);

    $response = $this->actingAs($platformActor)->getJson("/api/admin/permissions/{$permission->id}/roles")->assertOk();

    $ids = collect($response->json('data'))->pluck('id');
    expect($ids)->toContain($roleOrgA->id)->toContain($roleOrgB->id);
});

test('roles() responde 403 sin permissions.read', function () {
    $permission = Permission::factory()->create();
    $noPermission = User::factory()->create();

    $this->actingAs($noPermission)->getJson("/api/admin/permissions/{$permission->id}/roles")->assertForbidden();
});

// ---- GET /admin/permissions/{permission}/users ----

test('users() acota SIEMPRE por el tenant del actor (los usuarios nunca son globales)', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $permission = Permission::factory()->create();

    $roleOrgA = Role::factory()->create(['tenant_organization_id' => $orgA->id]);
    RolePermission::query()->create(['role_id' => $roleOrgA->id, 'permission_id' => $permission->id, 'is_active' => true]);
    $userOrgA = User::factory()->create(['tenant_organization_id' => $orgA->id]);
    UserRole::query()->create(['user_id' => $userOrgA->id, 'role_id' => $roleOrgA->id, 'is_active' => true]);

    $roleOrgB = Role::factory()->create(['tenant_organization_id' => $orgB->id]);
    RolePermission::query()->create(['role_id' => $roleOrgB->id, 'permission_id' => $permission->id, 'is_active' => true]);
    $userOrgB = User::factory()->create(['tenant_organization_id' => $orgB->id]);
    UserRole::query()->create(['user_id' => $userOrgB->id, 'role_id' => $roleOrgB->id, 'is_active' => true]);

    $actor = actorWithPermissionGrant(['permissions.read'], $orgA->id);

    $response = $this->actingAs($actor)->getJson("/api/admin/permissions/{$permission->id}/users")->assertOk();

    $ids = collect($response->json('data'))->pluck('id');
    expect($ids)->toContain($userOrgA->id)->not->toContain($userOrgB->id);

    $item = collect($response->json('data'))->firstWhere('id', $userOrgA->id);
    expect($item)->toHaveKeys(['person', 'status', 'roles']);
});

test('users() ve todos los tenants cuando el actor es platform staff', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $permission = Permission::factory()->create();

    $roleOrgA = Role::factory()->create(['tenant_organization_id' => $orgA->id]);
    RolePermission::query()->create(['role_id' => $roleOrgA->id, 'permission_id' => $permission->id, 'is_active' => true]);
    $userOrgA = User::factory()->create(['tenant_organization_id' => $orgA->id]);
    UserRole::query()->create(['user_id' => $userOrgA->id, 'role_id' => $roleOrgA->id, 'is_active' => true]);

    $roleOrgB = Role::factory()->create(['tenant_organization_id' => $orgB->id]);
    RolePermission::query()->create(['role_id' => $roleOrgB->id, 'permission_id' => $permission->id, 'is_active' => true]);
    $userOrgB = User::factory()->create(['tenant_organization_id' => $orgB->id]);
    UserRole::query()->create(['user_id' => $userOrgB->id, 'role_id' => $roleOrgB->id, 'is_active' => true]);

    $platformActor = platformOrgActorForPermission(['permissions.read']);

    $response = $this->actingAs($platformActor)->getJson("/api/admin/permissions/{$permission->id}/users")->assertOk();

    $ids = collect($response->json('data'))->pluck('id');
    expect($ids)->toContain($userOrgA->id)->toContain($userOrgB->id);
});

test('users() responde 403 sin permissions.read', function () {
    $permission = Permission::factory()->create();
    $noPermission = User::factory()->create();

    $this->actingAs($noPermission)->getJson("/api/admin/permissions/{$permission->id}/users")->assertForbidden();
});

// ---- GET /admin/permissions/{permission}/activity ----

test('activity() lista PERMISSION_ASSIGNED/PERMISSION_REVOKED de ESE permiso, acotado al tenant del actor', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $permission = Permission::factory()->create();
    $roleOrgA = Role::factory()->create(['tenant_organization_id' => $orgA->id]);

    $actorOrgA = actorWithPermissionGrant(['permissions.assign', 'audit.read'], $orgA->id);
    $this->actingAs($actorOrgA)->postJson("/api/admin/permissions/{$permission->id}/assign", ['role_id' => $roleOrgA->id])->assertOk();
    $this->actingAs($actorOrgA)->postJson("/api/admin/permissions/{$permission->id}/revoke", ['role_id' => $roleOrgA->id])->assertOk();

    // ruido: mismo permiso, actor de OTRO tenant -- no debe aparecer para actorOrgA.
    $roleOrgB = Role::factory()->create(['tenant_organization_id' => $orgB->id]);
    $actorOrgB = actorWithPermissionGrant(['permissions.assign'], $orgB->id);
    $this->actingAs($actorOrgB)->postJson("/api/admin/permissions/{$permission->id}/assign", ['role_id' => $roleOrgB->id])->assertOk();

    $response = $this->actingAs($actorOrgA)->getJson("/api/admin/permissions/{$permission->id}/activity")->assertOk();

    $events = collect($response->json('data'));
    expect($events->pluck('event_type')->all())->toBe(['PERMISSION_REVOKED', 'PERMISSION_ASSIGNED'])
        ->and($events->pluck('actor.id')->unique()->all())->toBe([$actorOrgA->id]);
});

test('activity() ve todos los tenants cuando el actor es platform staff', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $permission = Permission::factory()->create();
    $roleOrgA = Role::factory()->create(['tenant_organization_id' => $orgA->id]);
    $roleOrgB = Role::factory()->create(['tenant_organization_id' => $orgB->id]);

    $actorOrgA = actorWithPermissionGrant(['permissions.assign'], $orgA->id);
    $this->actingAs($actorOrgA)->postJson("/api/admin/permissions/{$permission->id}/assign", ['role_id' => $roleOrgA->id])->assertOk();

    $actorOrgB = actorWithPermissionGrant(['permissions.assign'], $orgB->id);
    $this->actingAs($actorOrgB)->postJson("/api/admin/permissions/{$permission->id}/assign", ['role_id' => $roleOrgB->id])->assertOk();

    $platformActor = platformOrgActorForPermission(['audit.read']);

    $response = $this->actingAs($platformActor)->getJson("/api/admin/permissions/{$permission->id}/activity")->assertOk();

    $actorIds = collect($response->json('data'))->pluck('actor.id');
    expect($actorIds)->toContain($actorOrgA->id)->toContain($actorOrgB->id);
});

test('activity() responde 403 sin audit.read', function () {
    $permission = Permission::factory()->create();
    $noPermission = User::factory()->create();

    $this->actingAs($noPermission)->getJson("/api/admin/permissions/{$permission->id}/activity")->assertForbidden();
});

// ---- GET /admin/permissions/matrix-by-module ----

test('matrixByModule devuelve el grid permisos x roles con assignments correctos', function () {
    $orgA = Organization::factory()->create();

    $permissionA = Permission::factory()->create(['code' => 'matrix.perm.a', 'module' => 'matrixmod', 'is_active' => true]);
    $permissionB = Permission::factory()->create(['code' => 'matrix.perm.b', 'module' => 'matrixmod', 'is_active' => true]);
    // permiso de otro módulo -- no debe aparecer.
    Permission::factory()->create(['code' => 'other.module.perm', 'module' => 'othermod', 'is_active' => true]);

    $roleOrgA = Role::factory()->create(['tenant_organization_id' => $orgA->id]);
    $globalRole = Role::factory()->create(['tenant_organization_id' => null]);

    RolePermission::query()->create(['role_id' => $roleOrgA->id, 'permission_id' => $permissionA->id, 'is_active' => true]);
    RolePermission::query()->create(['role_id' => $globalRole->id, 'permission_id' => $permissionA->id, 'is_active' => true]);
    // permissionB sin asignaciones -- assignments debe traer arreglo vacío.

    $actor = actorWithPermissionGrant(['permissions.read'], $orgA->id);

    $response = $this->actingAs($actor)->getJson('/api/admin/permissions/matrix-by-module?module=matrixmod')->assertOk();

    expect($response->json('module'))->toBe('matrixmod');

    $permissionCodes = collect($response->json('permissions'))->pluck('code');
    expect($permissionCodes)->toContain('matrix.perm.a')
        ->toContain('matrix.perm.b')
        ->not->toContain('other.module.perm');

    $assignments = $response->json('assignments');
    $assignedRoleIds = $assignments[(string) $permissionA->id];
    expect($assignedRoleIds)->toContain($roleOrgA->id)->toContain($globalRole->id)
        ->and($assignments[(string) $permissionB->id])->toBe([]);
});

test('matrixByModule aísla la lista de roles devuelta por tenant', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    Permission::factory()->create(['code' => 'matrix.tenant.perm', 'module' => 'matrixtenantmod', 'is_active' => true]);
    $roleOrgB = Role::factory()->create(['tenant_organization_id' => $orgB->id]);

    $actor = actorWithPermissionGrant(['permissions.read'], $orgA->id);

    $response = $this->actingAs($actor)->getJson('/api/admin/permissions/matrix-by-module?module=matrixtenantmod')->assertOk();

    $roleIds = collect($response->json('roles'))->pluck('id');
    expect($roleIds)->not->toContain($roleOrgB->id);
});

test('matrixByModule rechaza (422) un module que no existe en el catálogo', function () {
    $actor = actorWithPermissionGrant(['permissions.read']);

    $this->actingAs($actor)->getJson('/api/admin/permissions/matrix-by-module?module=modulo-inexistente-xyz')
        ->assertUnprocessable()
        ->assertJsonValidationErrors('module');
});

test('matrixByModule responde 403 sin permissions.read', function () {
    Permission::factory()->create(['module' => 'matrixforbiddenmod']);
    $noPermission = User::factory()->create();

    $this->actingAs($noPermission)->getJson('/api/admin/permissions/matrix-by-module?module=matrixforbiddenmod')->assertForbidden();
});

// ---- POST /admin/permissions/{permission}/revoke ----

test('revokeFromRole desactiva la fila de role_permissions y registra PERMISSION_REVOKED', function () {
    $permission = Permission::factory()->create();
    $targetRole = Role::factory()->create();
    RolePermission::query()->create(['role_id' => $targetRole->id, 'permission_id' => $permission->id, 'is_active' => true]);

    $noPermission = User::factory()->create();
    $this->actingAs($noPermission)->postJson("/api/admin/permissions/{$permission->id}/revoke", ['role_id' => $targetRole->id])
        ->assertForbidden();

    $actor = actorWithPermissionGrant(['permissions.assign']);
    $this->actingAs($actor)->postJson("/api/admin/permissions/{$permission->id}/revoke", ['role_id' => $targetRole->id])
        ->assertOk();

    expect(RolePermission::query()->where('role_id', $targetRole->id)->where('permission_id', $permission->id)->where('is_active', false)->exists())->toBeTrue();

    $log = SecurityLog::query()->where('event_type', 'PERMISSION_REVOKED')->latest('id')->first();
    expect($log)->not->toBeNull()
        ->and($log->metadata['permission_id'])->toBe($permission->id)
        ->and($log->metadata['target_role_id'])->toBe($targetRole->id);
});

test('revokeFromRole es idempotente -- revocar dos veces no falla', function () {
    $permission = Permission::factory()->create();
    $targetRole = Role::factory()->create();
    RolePermission::query()->create(['role_id' => $targetRole->id, 'permission_id' => $permission->id, 'is_active' => true]);
    $actor = actorWithPermissionGrant(['permissions.assign']);

    $this->actingAs($actor)->postJson("/api/admin/permissions/{$permission->id}/revoke", ['role_id' => $targetRole->id])->assertOk();
    $this->actingAs($actor)->postJson("/api/admin/permissions/{$permission->id}/revoke", ['role_id' => $targetRole->id])->assertOk();

    expect(RolePermission::query()->where('role_id', $targetRole->id)->where('permission_id', $permission->id)->count())->toBe(1);
});

test('revokeFromRole es idempotente incluso si nunca existió la asignación (no-op exitoso)', function () {
    $permission = Permission::factory()->create();
    $targetRole = Role::factory()->create();
    $actor = actorWithPermissionGrant(['permissions.assign']);

    $this->actingAs($actor)->postJson("/api/admin/permissions/{$permission->id}/revoke", ['role_id' => $targetRole->id])->assertOk();

    expect(RolePermission::query()->where('role_id', $targetRole->id)->where('permission_id', $permission->id)->exists())->toBeFalse();
});

test('revokeFromRole rechaza (422) un role_id que pertenece EXPLÍCITAMENTE a OTRO tenant (mismo mensaje que assignToRole)', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $permission = Permission::factory()->create();
    $roleOtherTenant = Role::factory()->create(['tenant_organization_id' => $orgB->id]);
    RolePermission::query()->create(['role_id' => $roleOtherTenant->id, 'permission_id' => $permission->id, 'is_active' => true]);

    $actor = actorWithPermissionGrant(['permissions.assign'], $orgA->id);

    $response = $this->actingAs($actor)->postJson("/api/admin/permissions/{$permission->id}/revoke", ['role_id' => $roleOtherTenant->id])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('role_id');

    expect($response->json('errors.role_id.0'))->toBe('El rol indicado no pertenece a tu organización.')
        ->and(RolePermission::query()->where('role_id', $roleOtherTenant->id)->where('permission_id', $permission->id)->where('is_active', true)->exists())->toBeTrue();
});
