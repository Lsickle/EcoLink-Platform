<?php

use App\Models\Organization;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\SecurityLog;
use App\Models\User;
use App\Models\UserRole;

// CU-007 (Gestionar Roles) -- gateado por RolePolicy -> User::hasPermission()
// + aislamiento cross-tenant en assignToUser (hallazgo Crítico, especialista-
// seguridad 2026-07-13).

function actorWithRolePermission(array $codes, ?int $tenantId = null): User
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

test('index/show respetan roles.read', function () {
    $target = Role::factory()->create();

    $noPermission = User::factory()->create();
    $this->actingAs($noPermission)->getJson('/api/admin/roles')->assertForbidden();
    $this->actingAs($noPermission)->getJson("/api/admin/roles/{$target->id}")->assertForbidden();

    $reader = actorWithRolePermission(['roles.read']);
    $this->actingAs($reader)->getJson('/api/admin/roles')->assertOk();
    $this->actingAs($reader)->getJson("/api/admin/roles/{$target->id}")->assertOk();
});

test('store crea un rol nuevo (roles.create) y registra auditoría', function () {
    $actor = actorWithRolePermission(['roles.create']);

    $response = $this->actingAs($actor)->postJson('/api/admin/roles', [
        'code' => 'OPERADOR',
        'name' => 'Operador',
        'description' => 'Rol operativo de prueba.',
    ]);

    $response->assertCreated()->assertJsonPath('role.code', 'OPERADOR');

    $role = Role::query()->where('code', 'OPERADOR')->firstOrFail();
    expect($role->is_system)->toBeFalse()->and($role->is_editable)->toBeTrue();

    expect(SecurityLog::query()->where('event_type', 'ROLE_CREATED')->exists())->toBeTrue();
});

test('store sin roles.create devuelve 403', function () {
    $actor = User::factory()->create();

    $this->actingAs($actor)->postJson('/api/admin/roles', ['code' => 'X', 'name' => 'X'])->assertForbidden();
});

test('update respeta roles.update y bloquea roles de sistema (is_editable=false)', function () {
    $editable = Role::factory()->create(['name' => 'Editable']);
    $systemRole = Role::factory()->create(['code' => 'ADMINISTRADOR', 'is_system' => true, 'is_editable' => false]);

    $actor = actorWithRolePermission(['roles.update']);

    $this->actingAs($actor)->putJson("/api/admin/roles/{$editable->id}", ['name' => 'Editado'])
        ->assertOk()
        ->assertJsonPath('role.name', 'Editado');

    $this->actingAs($actor)->putJson("/api/admin/roles/{$systemRole->id}", ['name' => 'Hackeado'])
        ->assertUnprocessable();

    expect($systemRole->fresh()->name)->not->toBe('Hackeado');
});

test('destroy respeta roles.delete, bloquea roles de sistema y roles con usuarios activos', function () {
    $emptyRole = Role::factory()->create();
    $systemRole = Role::factory()->create(['is_system' => true, 'is_editable' => false]);
    $roleWithUsers = Role::factory()->create();
    UserRole::query()->create(['user_id' => User::factory()->create()->id, 'role_id' => $roleWithUsers->id, 'is_active' => true]);

    $actor = actorWithRolePermission(['roles.delete']);

    $this->actingAs($actor)->deleteJson("/api/admin/roles/{$systemRole->id}")->assertUnprocessable();
    $this->actingAs($actor)->deleteJson("/api/admin/roles/{$roleWithUsers->id}")->assertUnprocessable();
    $this->actingAs($actor)->deleteJson("/api/admin/roles/{$emptyRole->id}")->assertNoContent();

    expect(Role::query()->find($emptyRole->id))->toBeNull()
        ->and(SecurityLog::query()->where('event_type', 'ROLE_DELETED')->exists())->toBeTrue();
});

test('assignToUser respeta roles.assign y crea la fila en user_roles', function () {
    $role = Role::factory()->create();
    $targetUser = User::factory()->create();

    $noPermission = User::factory()->create();
    $this->actingAs($noPermission)->postJson("/api/admin/roles/{$role->id}/assign", ['user_id' => $targetUser->id])
        ->assertForbidden();

    $actor = actorWithRolePermission(['roles.assign']);
    $this->actingAs($actor)->postJson("/api/admin/roles/{$role->id}/assign", ['user_id' => $targetUser->id])
        ->assertOk();

    expect(UserRole::query()->where('user_id', $targetUser->id)->where('role_id', $role->id)->where('is_active', true)->exists())->toBeTrue()
        ->and(SecurityLog::query()->where('event_type', 'ROLE_ASSIGNED')->exists())->toBeTrue();
});

test('assignToUser es idempotente -- reasignar el mismo rol no duplica la fila', function () {
    $role = Role::factory()->create();
    $targetUser = User::factory()->create();
    $actor = actorWithRolePermission(['roles.assign']);

    $this->actingAs($actor)->postJson("/api/admin/roles/{$role->id}/assign", ['user_id' => $targetUser->id])->assertOk();
    $this->actingAs($actor)->postJson("/api/admin/roles/{$role->id}/assign", ['user_id' => $targetUser->id])->assertOk();

    expect(UserRole::query()->where('user_id', $targetUser->id)->where('role_id', $role->id)->count())->toBe(1);
});

test('index y show exponen priority_level/is_editable/is_system (lote 2, wizard frontend)', function () {
    $role = Role::factory()->create(['priority_level' => 7, 'is_editable' => false, 'is_system' => true]);
    $actor = actorWithRolePermission(['roles.read']);

    // Hallazgo (pre-existente, no relacionado con este lote): el listado no
    // garantiza que ESTE rol quede en `data.0` -- el orden por defecto es
    // `name ASC`, y `actorWithRolePermission()` crea un segundo rol con
    // nombre aleatorio (`fake()->jobTitle()`) que puede ordenar antes o
    // después alfabéticamente. Se busca el ítem por `id` en vez de asumir
    // la posición, para que el test sea determinista.
    $response = $this->actingAs($actor)->getJson('/api/admin/roles')->assertOk();
    $item = collect($response->json('data'))->firstWhere('id', $role->id);

    expect($item)->not->toBeNull()
        ->and($item['priority_level'])->toBe(7)
        ->and($item['is_editable'])->toBeFalse()
        ->and($item['is_system'])->toBeTrue();

    $this->actingAs($actor)->getJson("/api/admin/roles/{$role->id}")
        ->assertOk()
        ->assertJsonPath('role.priority_level', 7)
        ->assertJsonPath('role.is_editable', false)
        ->assertJsonPath('role.is_system', true);
});

test('show devuelve los permisos actualmente asignados al rol (para "usar como plantilla")', function () {
    $role = Role::factory()->create();
    $permissionA = Permission::factory()->create(['code' => 'users.read']);
    $permissionB = Permission::factory()->create(['code' => 'users.update']);

    RolePermission::query()->create(['role_id' => $role->id, 'permission_id' => $permissionA->id, 'is_active' => true]);
    RolePermission::query()->create(['role_id' => $role->id, 'permission_id' => $permissionB->id, 'is_active' => true]);

    $actor = actorWithRolePermission(['roles.read']);

    $response = $this->actingAs($actor)->getJson("/api/admin/roles/{$role->id}")->assertOk();

    $codes = collect($response->json('role.permissions'))->pluck('code')->sort()->values()->all();
    expect($codes)->toBe(['users.read', 'users.update']);
});

test('show NO incluye un permiso revocado (is_active=false) en role.permissions (hallazgo real, cierre de brecha CRUD de Permisos)', function () {
    $role = Role::factory()->create();
    $activePermission = Permission::factory()->create(['code' => 'users.read']);
    $revokedPermission = Permission::factory()->create(['code' => 'users.delete']);

    RolePermission::query()->create(['role_id' => $role->id, 'permission_id' => $activePermission->id, 'is_active' => true]);
    RolePermission::query()->create(['role_id' => $role->id, 'permission_id' => $revokedPermission->id, 'is_active' => false]);

    $actor = actorWithRolePermission(['roles.read']);

    $response = $this->actingAs($actor)->getJson("/api/admin/roles/{$role->id}")->assertOk();

    $codes = collect($response->json('role.permissions'))->pluck('code')->all();
    expect($codes)->toBe(['users.read']);
});

test('show calcula risk_level según la cantidad de permisos críticos asignados (bajo/medio/alto/critico)', function (int $criticalCount, string $expectedLevel) {
    $role = Role::factory()->create();

    for ($i = 0; $i < $criticalCount; $i++) {
        $permission = Permission::factory()->create(['code' => "critical.perm.{$i}", 'is_critical' => true]);
        RolePermission::query()->create(['role_id' => $role->id, 'permission_id' => $permission->id, 'is_active' => true]);
    }

    // un permiso no-crítico de más, para confirmar que no cuenta en el umbral.
    $nonCritical = Permission::factory()->create(['code' => 'non.critical.perm', 'is_critical' => false]);
    RolePermission::query()->create(['role_id' => $role->id, 'permission_id' => $nonCritical->id, 'is_active' => true]);

    $actor = actorWithRolePermission(['roles.read']);

    $this->actingAs($actor)->getJson("/api/admin/roles/{$role->id}")
        ->assertOk()
        ->assertJsonPath('role.risk_level', $expectedLevel);
})->with([
    [0, 'bajo'],
    [1, 'medio'],
    [2, 'medio'],
    [3, 'alto'],
    [4, 'alto'],
    [5, 'critico'],
    [7, 'critico'],
]);

test('risk_level NO cuenta permisos críticos con role_permissions.is_active=false', function () {
    $role = Role::factory()->create();

    foreach (range(1, 5) as $i) {
        $permission = Permission::factory()->create(['code' => "critical.inactive.{$i}", 'is_critical' => true]);
        RolePermission::query()->create(['role_id' => $role->id, 'permission_id' => $permission->id, 'is_active' => false]);
    }

    $actor = actorWithRolePermission(['roles.read']);

    $this->actingAs($actor)->getJson("/api/admin/roles/{$role->id}")
        ->assertOk()
        ->assertJsonPath('role.risk_level', 'bajo');
});

// ---- Hallazgo Crítico (especialista-seguridad, 2026-07-13): aislamiento cross-tenant ----

test('assignToUser rechaza (422) un user_id que pertenece a OTRO tenant', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $role = Role::factory()->create();
    $targetOtherTenant = User::factory()->create(['tenant_organization_id' => $orgB->id]);

    $actor = actorWithRolePermission(['roles.assign'], $orgA->id);

    $this->actingAs($actor)->postJson("/api/admin/roles/{$role->id}/assign", ['user_id' => $targetOtherTenant->id])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('user_id');

    expect(UserRole::query()->where('user_id', $targetOtherTenant->id)->where('role_id', $role->id)->exists())->toBeFalse();
});

test('assignToUser permite un user_id del MISMO tenant que el actor', function () {
    $orgA = Organization::factory()->create();

    $role = Role::factory()->create();
    $targetSameTenant = User::factory()->create(['tenant_organization_id' => $orgA->id]);

    $actor = actorWithRolePermission(['roles.assign'], $orgA->id);

    $this->actingAs($actor)->postJson("/api/admin/roles/{$role->id}/assign", ['user_id' => $targetSameTenant->id])
        ->assertOk();

    expect(UserRole::query()->where('user_id', $targetSameTenant->id)->where('role_id', $role->id)->exists())->toBeTrue();
});

test('assignToUser rechaza (422) cuando el ROL (route model binding) pertenece EXPLÍCITAMENTE a OTRO tenant, aunque el user_id sea del propio tenant del actor', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $roleOtherTenant = Role::factory()->create(['tenant_organization_id' => $orgB->id]);
    $targetSameTenant = User::factory()->create(['tenant_organization_id' => $orgA->id]);

    $actor = actorWithRolePermission(['roles.assign'], $orgA->id);

    $this->actingAs($actor)->postJson("/api/admin/roles/{$roleOtherTenant->id}/assign", ['user_id' => $targetSameTenant->id])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('role');

    expect(UserRole::query()->where('user_id', $targetSameTenant->id)->where('role_id', $roleOtherTenant->id)->exists())->toBeFalse();
});

test('assignToUser permite un ROL GLOBAL (tenant_organization_id NULL, catálogo de sistema) para un usuario del tenant del actor', function () {
    $orgA = Organization::factory()->create();

    $globalRole = Role::factory()->create(['tenant_organization_id' => null, 'is_system' => true]);
    $targetSameTenant = User::factory()->create(['tenant_organization_id' => $orgA->id]);

    $actor = actorWithRolePermission(['roles.assign'], $orgA->id);

    $this->actingAs($actor)->postJson("/api/admin/roles/{$globalRole->id}/assign", ['user_id' => $targetSameTenant->id])
        ->assertOk();

    expect(UserRole::query()->where('user_id', $targetSameTenant->id)->where('role_id', $globalRole->id)->exists())->toBeTrue();
});

// ---- Hallazgo Crítico (especialista-seguridad, 2026-07-13, segunda pasada): Role sin la misma cobertura que User ----

test('store fija tenant_organization_id del actor (nunca NULL/global) al crear un rol', function () {
    $orgA = Organization::factory()->create();
    $actor = actorWithRolePermission(['roles.create'], $orgA->id);

    $this->actingAs($actor)->postJson('/api/admin/roles', [
        'code' => 'OPERADOR_TENANT_A',
        'name' => 'Operador Tenant A',
    ])->assertCreated();

    $role = Role::query()->where('code', 'OPERADOR_TENANT_A')->firstOrFail();
    expect($role->tenant_organization_id)->toBe($orgA->id);
});

test('index solo lista roles GLOBALES + roles del propio tenant, nunca roles de OTRO tenant', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $roleOrgA = Role::factory()->create(['tenant_organization_id' => $orgA->id]);
    $roleOrgB = Role::factory()->create(['tenant_organization_id' => $orgB->id]);
    $globalRole = Role::factory()->create(['tenant_organization_id' => null, 'code' => 'ADMINISTRADOR_GLOBAL_TEST']);

    $actor = actorWithRolePermission(['roles.read'], $orgA->id);

    $response = $this->actingAs($actor)->getJson('/api/admin/roles')->assertOk();

    $ids = collect($response->json('data'))->pluck('id');
    expect($ids)->toContain($roleOrgA->id)
        ->and($ids)->toContain($globalRole->id)
        ->and($ids)->not->toContain($roleOrgB->id);
});

test('view/update/delete DENIEGAN (403) sobre un rol de OTRO tenant', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $roleOtherTenant = Role::factory()->create(['tenant_organization_id' => $orgB->id]);

    $reader = actorWithRolePermission(['roles.read'], $orgA->id);
    $this->actingAs($reader)->getJson("/api/admin/roles/{$roleOtherTenant->id}")->assertForbidden();

    $editor = actorWithRolePermission(['roles.update'], $orgA->id);
    $this->actingAs($editor)->putJson("/api/admin/roles/{$roleOtherTenant->id}", ['name' => 'Hackeado'])->assertForbidden();

    $deleter = actorWithRolePermission(['roles.delete'], $orgA->id);
    $this->actingAs($deleter)->deleteJson("/api/admin/roles/{$roleOtherTenant->id}")->assertForbidden();

    expect($roleOtherTenant->fresh())->not->toBeNull()
        ->and($roleOtherTenant->fresh()->name)->not->toBe('Hackeado');
});

test('view/update/delete SÍ permiten operar sobre un rol GLOBAL (tenant_organization_id NULL) desde cualquier tenant', function () {
    $orgA = Organization::factory()->create();

    $globalEditableRole = Role::factory()->create(['tenant_organization_id' => null, 'is_editable' => true]);

    $reader = actorWithRolePermission(['roles.read'], $orgA->id);
    $this->actingAs($reader)->getJson("/api/admin/roles/{$globalEditableRole->id}")->assertOk();

    $editor = actorWithRolePermission(['roles.update'], $orgA->id);
    $this->actingAs($editor)->putJson("/api/admin/roles/{$globalEditableRole->id}", ['name' => 'Renombrado'])
        ->assertOk()
        ->assertJsonPath('role.name', 'Renombrado');

    $deleter = actorWithRolePermission(['roles.delete'], $orgA->id);
    $this->actingAs($deleter)->deleteJson("/api/admin/roles/{$globalEditableRole->id}")->assertNoContent();
});

test('view/update/delete permiten operar sobre un rol del PROPIO tenant', function () {
    $orgA = Organization::factory()->create();
    $ownRole = Role::factory()->create(['tenant_organization_id' => $orgA->id]);

    $reader = actorWithRolePermission(['roles.read'], $orgA->id);
    $this->actingAs($reader)->getJson("/api/admin/roles/{$ownRole->id}")->assertOk();

    $editor = actorWithRolePermission(['roles.update'], $orgA->id);
    $this->actingAs($editor)->putJson("/api/admin/roles/{$ownRole->id}", ['name' => 'Editado propio'])
        ->assertOk()
        ->assertJsonPath('role.name', 'Editado propio');
});

// ---- Lote 3 (Figma "Roles Management"): filtros/orden de index() ----

test('index filtra por search en name', function () {
    Role::factory()->create(['name' => 'Coordinador Ambiental']);
    Role::factory()->create(['name' => 'Operador Logistico']);
    $actor = actorWithRolePermission(['roles.read']);

    $response = $this->actingAs($actor)->getJson('/api/admin/roles?search=Ambiental')->assertOk();

    $names = collect($response->json('data'))->pluck('name');
    expect($names)->toContain('Coordinador Ambiental')->not->toContain('Operador Logistico');
});

test('index filtra por search en description', function () {
    Role::factory()->create(['name' => 'RolA', 'description' => 'Gestiona residuos peligrosos']);
    Role::factory()->create(['name' => 'RolB', 'description' => 'Sin relacion alguna']);
    $actor = actorWithRolePermission(['roles.read']);

    $response = $this->actingAs($actor)->getJson('/api/admin/roles?search=peligrosos')->assertOk();

    $names = collect($response->json('data'))->pluck('name');
    expect($names)->toContain('RolA')->not->toContain('RolB');
});

test('index filtra por status active/inactive', function () {
    Role::factory()->create(['name' => 'RolActivo', 'is_active' => true]);
    Role::factory()->create(['name' => 'RolInactivo', 'is_active' => false]);
    $actor = actorWithRolePermission(['roles.read']);

    $activeNames = collect($this->actingAs($actor)->getJson('/api/admin/roles?status=active')->assertOk()->json('data'))->pluck('name');
    expect($activeNames)->toContain('RolActivo')->not->toContain('RolInactivo');

    $inactiveNames = collect($this->actingAs($actor)->getJson('/api/admin/roles?status=inactive')->assertOk()->json('data'))->pluck('name');
    expect($inactiveNames)->toContain('RolInactivo')->not->toContain('RolActivo');
});

test('index filtra por type system/custom', function () {
    Role::factory()->create(['name' => 'RolSistema', 'is_system' => true, 'is_editable' => false]);
    Role::factory()->create(['name' => 'RolCustom', 'is_system' => false]);
    $actor = actorWithRolePermission(['roles.read']);

    $systemNames = collect($this->actingAs($actor)->getJson('/api/admin/roles?type=system')->assertOk()->json('data'))->pluck('name');
    expect($systemNames)->toContain('RolSistema')->not->toContain('RolCustom');

    $customNames = collect($this->actingAs($actor)->getJson('/api/admin/roles?type=custom')->assertOk()->json('data'))->pluck('name');
    expect($customNames)->toContain('RolCustom')->not->toContain('RolSistema');
});

test('index ordena por sort/direction (name y priority_level)', function () {
    Role::factory()->create(['name' => 'Zeta', 'priority_level' => 1]);
    Role::factory()->create(['name' => 'Alfa', 'priority_level' => 9]);
    $actor = actorWithRolePermission(['roles.read']);

    $namesAsc = collect($this->actingAs($actor)->getJson('/api/admin/roles?sort=name&direction=asc')->assertOk()->json('data'))->pluck('name')->values();
    expect($namesAsc->first())->toBe('Alfa');

    $namesDesc = collect($this->actingAs($actor)->getJson('/api/admin/roles?sort=name&direction=desc')->assertOk()->json('data'))->pluck('name')->values();
    expect($namesDesc->first())->toBe('Zeta');

    $byPriorityAsc = collect($this->actingAs($actor)->getJson('/api/admin/roles?sort=priority_level&direction=asc')->assertOk()->json('data'))->pluck('name')->values();
    expect($byPriorityAsc->first())->toBe('Zeta');
});

test('index ignora una columna de sort fuera de la whitelist (evita SQL injection vía nombre de columna)', function () {
    Role::factory()->create(['name' => 'RolCualquiera']);
    $actor = actorWithRolePermission(['roles.read']);

    $this->actingAs($actor)->getJson('/api/admin/roles?sort=1)); DROP TABLE roles; --')->assertOk();
});

test('index combina varios filtros a la vez (search + status + type)', function () {
    Role::factory()->create(['name' => 'Coordinador Activo Custom', 'description' => 'coordinacion', 'is_active' => true, 'is_system' => false]);
    Role::factory()->create(['name' => 'Coordinador Inactivo Custom', 'description' => 'coordinacion', 'is_active' => false, 'is_system' => false]);
    Role::factory()->create(['name' => 'Otro Activo Sistema', 'description' => 'coordinacion', 'is_active' => true, 'is_system' => true, 'is_editable' => false]);
    $actor = actorWithRolePermission(['roles.read']);

    $response = $this->actingAs($actor)
        ->getJson('/api/admin/roles?search=coordinacion&status=active&type=custom')
        ->assertOk();

    $names = collect($response->json('data'))->pluck('name');
    expect($names)->toContain('Coordinador Activo Custom')
        ->not->toContain('Coordinador Inactivo Custom')
        ->not->toContain('Otro Activo Sistema');
});

test('index expone users_count/permissions_count/risk_level por rol', function () {
    $role = Role::factory()->create();
    $permission = Permission::factory()->create(['is_critical' => true]);
    RolePermission::query()->create(['role_id' => $role->id, 'permission_id' => $permission->id, 'is_active' => true]);
    UserRole::query()->create(['user_id' => User::factory()->create()->id, 'role_id' => $role->id, 'is_active' => true]);

    $actor = actorWithRolePermission(['roles.read']);

    $response = $this->actingAs($actor)->getJson('/api/admin/roles')->assertOk();

    $item = collect($response->json('data'))->firstWhere('id', $role->id);
    expect($item)->not->toBeNull()
        ->and($item['users_count'])->toBe(1)
        ->and($item['permissions_count'])->toBe(1)
        ->and($item['risk_level'])->toBe('medio');
});

// ---- Lote 3: activate()/deactivate() ----

test('activate/deactivate respetan roles.update, cambian is_active y registran auditoría', function () {
    $role = Role::factory()->create(['is_active' => true]);
    $actor = actorWithRolePermission(['roles.update']);

    $this->actingAs($actor)->postJson("/api/admin/roles/{$role->id}/deactivate")
        ->assertOk()
        ->assertJsonPath('role.is_active', false);

    expect($role->fresh()->is_active)->toBeFalse()
        ->and(SecurityLog::query()->where('event_type', 'ROLE_DEACTIVATED')->exists())->toBeTrue();

    $this->actingAs($actor)->postJson("/api/admin/roles/{$role->id}/activate")
        ->assertOk()
        ->assertJsonPath('role.is_active', true);

    expect($role->fresh()->is_active)->toBeTrue()
        ->and(SecurityLog::query()->where('event_type', 'ROLE_ACTIVATED')->exists())->toBeTrue();
});

test('activate/deactivate sin roles.update devuelven 403', function () {
    $role = Role::factory()->create();
    $actor = User::factory()->create();

    $this->actingAs($actor)->postJson("/api/admin/roles/{$role->id}/activate")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/roles/{$role->id}/deactivate")->assertForbidden();
});

test('activate/deactivate bloquean (422) un rol de sistema (is_editable=false)', function () {
    $systemRole = Role::factory()->create(['is_system' => true, 'is_editable' => false, 'is_active' => true]);
    $actor = actorWithRolePermission(['roles.update']);

    $this->actingAs($actor)->postJson("/api/admin/roles/{$systemRole->id}/deactivate")->assertUnprocessable();
    $this->actingAs($actor)->postJson("/api/admin/roles/{$systemRole->id}/activate")->assertUnprocessable();

    expect($systemRole->fresh()->is_active)->toBeTrue();
});

test('activate/deactivate DENIEGAN (403) sobre un rol de OTRO tenant', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $roleOtherTenant = Role::factory()->create(['tenant_organization_id' => $orgB->id]);
    $actor = actorWithRolePermission(['roles.update'], $orgA->id);

    $this->actingAs($actor)->postJson("/api/admin/roles/{$roleOtherTenant->id}/deactivate")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/roles/{$roleOtherTenant->id}/activate")->assertForbidden();

    expect($roleOtherTenant->fresh()->is_active)->toBeTrue();
});

// ---- Lote 3: User::effectivePermissionCodes() ya excluye roles desactivados (confirmado, no requirió fix) ----

// ---- Hallazgo Alto (especialista-seguridad, 2026-07-14): deactivate() sin guarda contra "tenant sin nadie con roles.update" ----

test('deactivate rechaza (422) desactivar el ÚNICO rol que otorga roles.update al tenant', function () {
    $orgA = Organization::factory()->create();

    $onlyRole = Role::factory()->create(['tenant_organization_id' => $orgA->id, 'is_active' => true]);
    $permission = Permission::query()->firstOrCreate(['code' => 'roles.update'], [
        'name' => 'roles.update', 'module' => 'roles', 'action' => 'update', 'scope' => 'tenant', 'is_system' => true, 'is_active' => true,
    ]);
    RolePermission::query()->create(['role_id' => $onlyRole->id, 'permission_id' => $permission->id, 'is_active' => true]);

    $holder = User::factory()->create(['tenant_organization_id' => $orgA->id]);
    UserRole::query()->create(['user_id' => $holder->id, 'role_id' => $onlyRole->id, 'is_active' => true]);

    // El actor necesita roles.update para pasar la Gate -- usamos el mismo rol/usuario que se intenta desactivar.
    $response = $this->actingAs($holder)->postJson("/api/admin/roles/{$onlyRole->id}/deactivate")
        ->assertUnprocessable();

    expect($response->json('errors.role.0'))->toBe('No se puede desactivar este rol: dejaría a la organización sin nadie con permiso para revertir la acción.')
        ->and($onlyRole->fresh()->is_active)->toBeTrue();
});

test('deactivate SÍ permite desactivar un rol con roles.update si otro usuario tiene ADMINISTRADOR global (otra vía)', function () {
    $orgA = Organization::factory()->create();

    $onlyTenantRole = Role::factory()->create(['tenant_organization_id' => $orgA->id, 'is_active' => true]);
    $permission = Permission::query()->firstOrCreate(['code' => 'roles.update'], [
        'name' => 'roles.update', 'module' => 'roles', 'action' => 'update', 'scope' => 'tenant', 'is_system' => true, 'is_active' => true,
    ]);
    RolePermission::query()->create(['role_id' => $onlyTenantRole->id, 'permission_id' => $permission->id, 'is_active' => true]);

    $holder = User::factory()->create(['tenant_organization_id' => $orgA->id]);
    UserRole::query()->create(['user_id' => $holder->id, 'role_id' => $onlyTenantRole->id, 'is_active' => true]);

    // Otra vía: rol GLOBAL (tenant_organization_id NULL) con roles.update, asignado a OTRO usuario del mismo tenant.
    $globalAdminRole = Role::factory()->create(['tenant_organization_id' => null, 'is_system' => true, 'is_active' => true]);
    RolePermission::query()->create(['role_id' => $globalAdminRole->id, 'permission_id' => $permission->id, 'is_active' => true]);
    $globalAdminUser = User::factory()->create(['tenant_organization_id' => $orgA->id]);
    UserRole::query()->create(['user_id' => $globalAdminUser->id, 'role_id' => $globalAdminRole->id, 'is_active' => true]);

    $this->actingAs($holder)->postJson("/api/admin/roles/{$onlyTenantRole->id}/deactivate")
        ->assertOk()
        ->assertJsonPath('role.is_active', false);

    expect($onlyTenantRole->fresh()->is_active)->toBeFalse();
});

test('deactivate SÍ permite desactivar un rol con roles.update si OTRO rol del mismo tenant también lo otorga', function () {
    $orgA = Organization::factory()->create();

    $roleBeingDeactivated = Role::factory()->create(['tenant_organization_id' => $orgA->id, 'is_active' => true]);
    $permission = Permission::query()->firstOrCreate(['code' => 'roles.update'], [
        'name' => 'roles.update', 'module' => 'roles', 'action' => 'update', 'scope' => 'tenant', 'is_system' => true, 'is_active' => true,
    ]);
    RolePermission::query()->create(['role_id' => $roleBeingDeactivated->id, 'permission_id' => $permission->id, 'is_active' => true]);

    $holder = User::factory()->create(['tenant_organization_id' => $orgA->id]);
    UserRole::query()->create(['user_id' => $holder->id, 'role_id' => $roleBeingDeactivated->id, 'is_active' => true]);

    // Otra vía: OTRO rol del MISMO tenant, con roles.update, asignado a otro usuario.
    $otherTenantRole = Role::factory()->create(['tenant_organization_id' => $orgA->id, 'is_active' => true]);
    RolePermission::query()->create(['role_id' => $otherTenantRole->id, 'permission_id' => $permission->id, 'is_active' => true]);
    $otherHolder = User::factory()->create(['tenant_organization_id' => $orgA->id]);
    UserRole::query()->create(['user_id' => $otherHolder->id, 'role_id' => $otherTenantRole->id, 'is_active' => true]);

    $this->actingAs($holder)->postJson("/api/admin/roles/{$roleBeingDeactivated->id}/deactivate")
        ->assertOk()
        ->assertJsonPath('role.is_active', false);

    expect($roleBeingDeactivated->fresh()->is_active)->toBeFalse();
});

// ---- Lote 4 (Figma "Detalle de Rol"): show() resuelve created_by/updated_by ----

test('show resuelve created_by/updated_by a {id, username}', function () {
    $creator = User::factory()->create(['username' => 'creador_test']);
    $editor = User::factory()->create(['username' => 'editor_test']);
    $role = Role::factory()->create(['created_by' => $creator->id, 'updated_by' => $editor->id]);

    $actor = actorWithRolePermission(['roles.read']);

    $response = $this->actingAs($actor)->getJson("/api/admin/roles/{$role->id}")->assertOk();

    $response->assertJsonPath('role.created_by.id', $creator->id)
        ->assertJsonPath('role.created_by.username', 'creador_test')
        ->assertJsonPath('role.updated_by.id', $editor->id)
        ->assertJsonPath('role.updated_by.username', 'editor_test');
});

test('show expone users_count/permissions_count con el mismo criterio que index (bug real: show() nunca los calculaba)', function () {
    $role = Role::factory()->create();
    $permission = Permission::factory()->create(['is_critical' => true]);
    RolePermission::query()->create(['role_id' => $role->id, 'permission_id' => $permission->id, 'is_active' => true]);
    UserRole::query()->create(['user_id' => User::factory()->create()->id, 'role_id' => $role->id, 'is_active' => true]);
    UserRole::query()->create(['user_id' => User::factory()->create()->id, 'role_id' => $role->id, 'is_active' => true]);

    $actor = actorWithRolePermission(['roles.read']);

    $response = $this->actingAs($actor)->getJson("/api/admin/roles/{$role->id}")->assertOk();

    $response->assertJsonPath('role.users_count', 2)
        ->assertJsonPath('role.permissions_count', 1);
});

test('show devuelve created_by/updated_by NULL cuando el rol no tiene esos campos poblados (seeds antiguos)', function () {
    $role = Role::factory()->create(['created_by' => null, 'updated_by' => null]);
    $actor = actorWithRolePermission(['roles.read']);

    $this->actingAs($actor)->getJson("/api/admin/roles/{$role->id}")
        ->assertOk()
        ->assertJsonPath('role.created_by', null)
        ->assertJsonPath('role.updated_by', null);
});

test('store/update fijan created_by/updated_by al actor autenticado', function () {
    $actor = actorWithRolePermission(['roles.create', 'roles.update']);

    $response = $this->actingAs($actor)->postJson('/api/admin/roles', [
        'code' => 'ROL_AUDITADO',
        'name' => 'Rol Auditado',
    ])->assertCreated();

    $role = Role::query()->findOrFail($response->json('role.id'));
    expect($role->created_by)->toBe($actor->id)->and($role->updated_by)->toBe($actor->id);

    $otherActor = actorWithRolePermission(['roles.update']);
    $this->actingAs($otherActor)->putJson("/api/admin/roles/{$role->id}", ['name' => 'Rol Auditado Editado'])->assertOk();

    expect($role->fresh()->updated_by)->toBe($otherActor->id)
        // created_by no cambia con update().
        ->and($role->fresh()->created_by)->toBe($actor->id);
});

// ---- Lote 4 (Figma "Detalle de Rol"): GET /admin/roles/{role}/users ----

test('users() devuelve los usuarios activos asignados al rol, con el mismo shape que UserManagementController::index()', function () {
    $role = Role::factory()->create();
    $assignedUser = User::factory()->create();
    UserRole::query()->create(['user_id' => $assignedUser->id, 'role_id' => $role->id, 'is_active' => true]);

    // usuario con asignación INACTIVA -- no debe aparecer.
    $inactiveAssignment = User::factory()->create();
    UserRole::query()->create(['user_id' => $inactiveAssignment->id, 'role_id' => $role->id, 'is_active' => false]);

    $actor = actorWithRolePermission(['roles.read']);

    $response = $this->actingAs($actor)->getJson("/api/admin/roles/{$role->id}/users")->assertOk();

    $ids = collect($response->json('data'))->pluck('id');
    expect($ids)->toContain($assignedUser->id)->not->toContain($inactiveAssignment->id);

    // mismo shape que UserManagementController::index(): person/status/roles cargados.
    $item = collect($response->json('data'))->firstWhere('id', $assignedUser->id);
    expect($item)->toHaveKeys(['person', 'status', 'roles']);
});

test('users() pagina con per_page', function () {
    $role = Role::factory()->create();
    foreach (range(1, 3) as $i) {
        $user = User::factory()->create();
        UserRole::query()->create(['user_id' => $user->id, 'role_id' => $role->id, 'is_active' => true]);
    }
    $actor = actorWithRolePermission(['roles.read']);

    $response = $this->actingAs($actor)->getJson("/api/admin/roles/{$role->id}/users?per_page=2")->assertOk();

    expect($response->json('data'))->toHaveCount(2)
        ->and($response->json('per_page'))->toBe(2)
        ->and($response->json('total'))->toBe(3);
});

test('users() responde 403 sin permiso roles.read', function () {
    $role = Role::factory()->create();
    $noPermission = User::factory()->create();

    $this->actingAs($noPermission)->getJson("/api/admin/roles/{$role->id}/users")->assertForbidden();
});

test('users() responde 403 (aislamiento cross-tenant) cuando el rol pertenece a OTRO tenant', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $roleOtherTenant = Role::factory()->create(['tenant_organization_id' => $orgB->id]);
    $actor = actorWithRolePermission(['roles.read'], $orgA->id);

    $this->actingAs($actor)->getJson("/api/admin/roles/{$roleOtherTenant->id}/users")->assertForbidden();
});

// ---- Lote 4 (Figma "Detalle de Rol"): GET /admin/roles/{role}/activity ----

test('activity() devuelve ROLE_CREATED/ROLE_UPDATED/PERMISSION_ASSIGNED de ESE rol, ordenados created_at desc', function () {
    $actor = actorWithRolePermission(['roles.create', 'roles.update', 'permissions.assign', 'audit.read']);

    $created = $this->actingAs($actor)->postJson('/api/admin/roles', [
        'code' => 'ROL_ACTIVIDAD', 'name' => 'Rol Actividad',
    ])->assertCreated();
    $role = Role::query()->findOrFail($created->json('role.id'));

    $this->actingAs($actor)->putJson("/api/admin/roles/{$role->id}", ['name' => 'Rol Actividad Editado'])->assertOk();

    $permission = Permission::factory()->create(['code' => 'waste.read.for.activity.test']);
    $this->actingAs($actor)->postJson("/api/admin/permissions/{$permission->id}/assign", ['role_id' => $role->id])->assertOk();

    // ruido: evento de OTRO rol, con la misma clave de metadata -- no debe aparecer.
    $otherRole = Role::factory()->create();
    $this->actingAs($actor)->putJson("/api/admin/roles/{$otherRole->id}", ['name' => 'Otro Rol'])->assertOk();

    $response = $this->actingAs($actor)->getJson("/api/admin/roles/{$role->id}/activity")->assertOk();

    $events = collect($response->json('data'))->pluck('event_type');
    expect($events->all())->toBe(['PERMISSION_ASSIGNED', 'ROLE_UPDATED', 'ROLE_CREATED']);

    $first = collect($response->json('data'))->first();
    expect($first)->toHaveKeys(['event_type', 'description', 'actor', 'created_at'])
        ->and($first['actor']['id'])->toBe($actor->id)
        ->and($first['actor']['username'])->toBe($actor->username);
});

test('activity() responde 403 sin permiso audit.read', function () {
    $role = Role::factory()->create();
    $noPermission = User::factory()->create();

    $this->actingAs($noPermission)->getJson("/api/admin/roles/{$role->id}/activity")->assertForbidden();
});

test('activity() responde 422 (aislamiento cross-tenant) cuando el rol pertenece a OTRO tenant', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $roleOtherTenant = Role::factory()->create(['tenant_organization_id' => $orgB->id]);
    $actor = actorWithRolePermission(['audit.read'], $orgA->id);

    $this->actingAs($actor)->getJson("/api/admin/roles/{$roleOtherTenant->id}/activity")->assertUnprocessable();
});

// ---- Hallazgo Crítico (especialista-seguridad, 2026-07-14, tercera pasada): users()/activity() sobre un rol GLOBAL exponían PII/actividad de OTROS tenants ----

function platformOrgActor(array $codes): User
{
    $platform = Organization::factory()->create(['is_platform_tenant' => true]);

    return actorWithRolePermission($codes, $platform->id);
}

test('users() en un rol GLOBAL solo expone usuarios del propio tenant del actor, nunca de otros tenants', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $globalRole = Role::factory()->create(['tenant_organization_id' => null, 'code' => 'ADMINISTRADOR_GLOBAL_USERS_TEST']);

    $userOrgA = User::factory()->create(['tenant_organization_id' => $orgA->id]);
    UserRole::query()->create(['user_id' => $userOrgA->id, 'role_id' => $globalRole->id, 'is_active' => true]);

    $userOrgB = User::factory()->create(['tenant_organization_id' => $orgB->id]);
    UserRole::query()->create(['user_id' => $userOrgB->id, 'role_id' => $globalRole->id, 'is_active' => true]);

    $actor = actorWithRolePermission(['roles.read'], $orgA->id);

    $response = $this->actingAs($actor)->getJson("/api/admin/roles/{$globalRole->id}/users")->assertOk();

    $ids = collect($response->json('data'))->pluck('id');
    expect($ids)->toContain($userOrgA->id)->not->toContain($userOrgB->id);
});

test('activity() en un rol GLOBAL solo expone eventos de actores del propio tenant, nunca de otros tenants', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $globalRole = Role::factory()->create(['tenant_organization_id' => null, 'code' => 'ADMINISTRADOR_GLOBAL_ACTIVITY_TEST']);

    $actorOrgA = actorWithRolePermission(['roles.assign', 'audit.read'], $orgA->id);
    $userOrgA = User::factory()->create(['tenant_organization_id' => $orgA->id]);
    $this->actingAs($actorOrgA)->postJson("/api/admin/roles/{$globalRole->id}/assign", ['user_id' => $userOrgA->id])->assertOk();

    $actorOrgB = actorWithRolePermission(['roles.assign'], $orgB->id);
    $userOrgB = User::factory()->create(['tenant_organization_id' => $orgB->id]);
    $this->actingAs($actorOrgB)->postJson("/api/admin/roles/{$globalRole->id}/assign", ['user_id' => $userOrgB->id])->assertOk();

    $response = $this->actingAs($actorOrgA)->getJson("/api/admin/roles/{$globalRole->id}/activity")->assertOk();

    $actorIds = collect($response->json('data'))->pluck('actor.id');
    expect($actorIds)->toContain($actorOrgA->id)->not->toContain($actorOrgB->id);
});

test('users()/activity() SÍ ven todos los tenants para un rol GLOBAL cuando el actor es platform staff (isPlatformStaff bypass)', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $globalRole = Role::factory()->create(['tenant_organization_id' => null, 'code' => 'ADMINISTRADOR_GLOBAL_STAFF_TEST']);

    $userOrgA = User::factory()->create(['tenant_organization_id' => $orgA->id]);
    UserRole::query()->create(['user_id' => $userOrgA->id, 'role_id' => $globalRole->id, 'is_active' => true]);
    $userOrgB = User::factory()->create(['tenant_organization_id' => $orgB->id]);
    UserRole::query()->create(['user_id' => $userOrgB->id, 'role_id' => $globalRole->id, 'is_active' => true]);

    $platformActor = platformOrgActor(['roles.read', 'audit.read']);

    $usersResponse = $this->actingAs($platformActor)->getJson("/api/admin/roles/{$globalRole->id}/users")->assertOk();
    $ids = collect($usersResponse->json('data'))->pluck('id');
    expect($ids)->toContain($userOrgA->id)->toContain($userOrgB->id);

    $actorOrgA = actorWithRolePermission(['roles.assign'], $orgA->id);
    $this->actingAs($actorOrgA)->postJson("/api/admin/roles/{$globalRole->id}/assign", ['user_id' => $userOrgA->id])->assertOk();
    $actorOrgB = actorWithRolePermission(['roles.assign'], $orgB->id);
    $this->actingAs($actorOrgB)->postJson("/api/admin/roles/{$globalRole->id}/assign", ['user_id' => $userOrgB->id])->assertOk();

    $activityResponse = $this->actingAs($platformActor)->getJson("/api/admin/roles/{$globalRole->id}/activity")->assertOk();
    $actorIds = collect($activityResponse->json('data'))->pluck('actor.id');
    expect($actorIds)->toContain($actorOrgA->id)->toContain($actorOrgB->id);
});

test('users()/activity() en un rol NO global (ya scoped a un tenant específico) no aplican el filtro adicional -- sin regresiones', function () {
    $orgA = Organization::factory()->create();

    $tenantRole = Role::factory()->create(['tenant_organization_id' => $orgA->id]);

    $userA1 = User::factory()->create(['tenant_organization_id' => $orgA->id]);
    UserRole::query()->create(['user_id' => $userA1->id, 'role_id' => $tenantRole->id, 'is_active' => true]);

    $actor = actorWithRolePermission(['roles.read', 'roles.assign', 'audit.read'], $orgA->id);

    $usersResponse = $this->actingAs($actor)->getJson("/api/admin/roles/{$tenantRole->id}/users")->assertOk();
    expect(collect($usersResponse->json('data'))->pluck('id'))->toContain($userA1->id);

    $this->actingAs($actor)->postJson("/api/admin/roles/{$tenantRole->id}/assign", ['user_id' => $userA1->id])->assertOk();

    $activityResponse = $this->actingAs($actor)->getJson("/api/admin/roles/{$tenantRole->id}/activity")->assertOk();
    expect(collect($activityResponse->json('data'))->pluck('event_type'))->toContain('ROLE_ASSIGNED');
});

// ---- Recomendación Media (mismo reporte, 2026-07-14): contrato de metadata para el filtro de activity() ----

test('contrato: ROLE_CREATED/ROLE_UPDATED/ROLE_ASSIGNED/ROLE_DELETED/PERMISSION_ASSIGNED siempre incluyen role_id (o target_role_id) en metadata', function () {
    $actor = actorWithRolePermission(['roles.create', 'roles.update', 'roles.delete', 'roles.assign', 'permissions.assign']);

    $created = $this->actingAs($actor)->postJson('/api/admin/roles', ['code' => 'ROL_CONTRATO', 'name' => 'Rol Contrato'])->assertCreated();
    $role = Role::query()->findOrFail($created->json('role.id'));

    $this->actingAs($actor)->putJson("/api/admin/roles/{$role->id}", ['name' => 'Rol Contrato Editado'])->assertOk();

    $targetUser = User::factory()->create();
    $this->actingAs($actor)->postJson("/api/admin/roles/{$role->id}/assign", ['user_id' => $targetUser->id])->assertOk();

    $permission = Permission::factory()->create(['code' => 'contract.test.permission']);
    $this->actingAs($actor)->postJson("/api/admin/permissions/{$permission->id}/assign", ['role_id' => $role->id])->assertOk();

    $emptyRole = Role::factory()->create();
    $this->actingAs($actor)->deleteJson("/api/admin/roles/{$emptyRole->id}")->assertNoContent();

    $expectations = [
        'ROLE_CREATED' => 'role_id',
        'ROLE_UPDATED' => 'role_id',
        'ROLE_ASSIGNED' => 'role_id',
        'ROLE_DELETED' => 'role_id',
        'PERMISSION_ASSIGNED' => 'target_role_id',
    ];

    foreach ($expectations as $eventType => $metadataKey) {
        $log = SecurityLog::query()->where('event_type', $eventType)->latest('id')->first();
        expect($log)->not->toBeNull("Falta evento {$eventType}.")
            ->and($log->metadata[$metadataKey] ?? null)->not->toBeNull("El evento {$eventType} no incluye '{$metadataKey}' en metadata.");
    }
});

// ---- Cierre de brecha CRUD de Permisos vs. Figma: PERMISSION_REVOKED visible en la Auditoría del rol ----

test('activity() del rol incluye PERMISSION_REVOKED cuando se revoca un permiso de ESE rol (antes solo se veía PERMISSION_ASSIGNED)', function () {
    $actor = actorWithRolePermission(['roles.read', 'permissions.assign', 'audit.read']);
    $role = Role::factory()->create();
    $permission = Permission::factory()->create(['code' => 'waste.read.for.revoke.activity.test']);

    $this->actingAs($actor)->postJson("/api/admin/permissions/{$permission->id}/assign", ['role_id' => $role->id])->assertOk();
    $this->actingAs($actor)->postJson("/api/admin/permissions/{$permission->id}/revoke", ['role_id' => $role->id])->assertOk();

    $response = $this->actingAs($actor)->getJson("/api/admin/roles/{$role->id}/activity")->assertOk();

    $events = collect($response->json('data'))->pluck('event_type');
    expect($events->all())->toBe(['PERMISSION_REVOKED', 'PERMISSION_ASSIGNED']);
});

test('un usuario pierde sus permisos efectivos cuando su rol se desactiva, y los recupera al reactivarlo', function () {
    $role = Role::factory()->create(['is_active' => true]);
    $permission = Permission::factory()->create(['code' => 'waste.manage']);
    RolePermission::query()->create(['role_id' => $role->id, 'permission_id' => $permission->id, 'is_active' => true]);

    $targetUser = User::factory()->create();
    UserRole::query()->create(['user_id' => $targetUser->id, 'role_id' => $role->id, 'is_active' => true]);

    expect($targetUser->effectivePermissionCodes())->toContain('waste.manage');

    $actor = actorWithRolePermission(['roles.update']);
    $this->actingAs($actor)->postJson("/api/admin/roles/{$role->id}/deactivate")->assertOk();

    expect($targetUser->effectivePermissionCodes())->not->toContain('waste.manage');

    $this->actingAs($actor)->postJson("/api/admin/roles/{$role->id}/activate")->assertOk();

    expect($targetUser->effectivePermissionCodes())->toContain('waste.manage');
});
