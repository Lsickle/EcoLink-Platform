<?php

use App\Models\Organization;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\UserRole;
use Illuminate\Support\Facades\Gate;

// Verifica que las Policies quedan auto-descubiertas por convención de
// nombres (App\Models\X -> App\Policies\XPolicy, Laravel 13) sin registro
// manual, y que cada método delega correctamente en User::hasPermission().

function grantPermission(User $user, string $code): void
{
    $role = Role::factory()->create();
    $permission = Permission::factory()->create(['code' => $code]);

    RolePermission::query()->create(['role_id' => $role->id, 'permission_id' => $permission->id, 'is_active' => true]);
    UserRole::query()->create(['user_id' => $user->id, 'role_id' => $role->id, 'is_active' => true]);
}

// ---- UserPolicy ----

test('UserPolicy: view/update/delete/activate/deactivate/resetPassword se auto-descubren y respetan el permiso (mismo tenant, ambos NULL)', function (string $ability, string $permissionCode) {
    $actorWithout = User::factory()->create();
    $actorWith = User::factory()->create();
    $target = User::factory()->create();

    grantPermission($actorWith, $permissionCode);

    expect(Gate::forUser($actorWithout)->allows($ability, [User::class, $target]))->toBeFalse()
        ->and(Gate::forUser($actorWith)->allows($ability, [User::class, $target]))->toBeTrue();
})->with([
    ['view', 'users.read'],
    ['update', 'users.update'],
    ['delete', 'users.delete'],
    ['activate', 'users.activate'],
    ['deactivate', 'users.deactivate'],
    ['resetPassword', 'users.reset-password'],
    ['resendInvitation', 'users.create'],
]);

test('UserPolicy: create se auto-descubre y respeta el permiso (sin instancia, no aplica chequeo de tenant)', function () {
    $actorWithout = User::factory()->create();
    $actorWith = User::factory()->create();
    grantPermission($actorWith, 'users.create');

    expect(Gate::forUser($actorWithout)->allows('create', User::class))->toBeFalse()
        ->and(Gate::forUser($actorWith)->allows('create', User::class))->toBeTrue();
});

test('UserPolicy: viewAny se auto-descubre y respeta users.read', function () {
    $actorWithout = User::factory()->create();
    $actorWith = User::factory()->create();
    grantPermission($actorWith, 'users.read');

    expect(Gate::forUser($actorWithout)->allows('viewAny', User::class))->toBeFalse()
        ->and(Gate::forUser($actorWith)->allows('viewAny', User::class))->toBeTrue();
});

// ---- Hallazgo Crítico (especialista-seguridad, 2026-07-13): aislamiento cross-tenant ----

test('UserPolicy: view/update/delete/activate/deactivate/resetPassword DENIEGAN sobre un usuario de OTRO tenant, aunque el actor tenga el permiso', function (string $ability, string $permissionCode) {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $actor = User::factory()->create(['tenant_organization_id' => $orgA->id]);
    grantPermission($actor, $permissionCode);

    $targetSameTenant = User::factory()->create(['tenant_organization_id' => $orgA->id]);
    $targetOtherTenant = User::factory()->create(['tenant_organization_id' => $orgB->id]);

    expect(Gate::forUser($actor)->allows($ability, [User::class, $targetSameTenant]))->toBeTrue()
        ->and(Gate::forUser($actor)->allows($ability, [User::class, $targetOtherTenant]))->toBeFalse();
})->with([
    ['view', 'users.read'],
    ['update', 'users.update'],
    ['delete', 'users.delete'],
    ['activate', 'users.activate'],
    ['deactivate', 'users.deactivate'],
    ['resetPassword', 'users.reset-password'],
    ['resendInvitation', 'users.create'],
]);

// ---- RolePolicy ----

test('RolePolicy: CRUD y assign se auto-descubren y respetan el permiso', function (string $ability, string $permissionCode) {
    $actorWithout = User::factory()->create();
    $actorWith = User::factory()->create();
    $role = Role::factory()->create();

    grantPermission($actorWith, $permissionCode);

    expect(Gate::forUser($actorWithout)->allows($ability, $role))->toBeFalse()
        ->and(Gate::forUser($actorWith)->allows($ability, $role))->toBeTrue();
})->with([
    ['view', 'roles.read'],
    ['update', 'roles.update'],
    ['delete', 'roles.delete'],
]);

test('RolePolicy: create y assign (sin instancia) se auto-descubren y respetan el permiso', function () {
    $actorWithout = User::factory()->create();
    $actorWith = User::factory()->create();
    grantPermission($actorWith, 'roles.create');

    expect(Gate::forUser($actorWithout)->allows('create', Role::class))->toBeFalse()
        ->and(Gate::forUser($actorWith)->allows('create', Role::class))->toBeTrue();

    $actorAssign = User::factory()->create();
    grantPermission($actorAssign, 'roles.assign');

    expect(Gate::forUser($actorWithout)->allows('assign', Role::class))->toBeFalse()
        ->and(Gate::forUser($actorAssign)->allows('assign', Role::class))->toBeTrue();
});

// ---- PermissionPolicy ----

test('PermissionPolicy: viewAny/view/assign se auto-descubren y respetan el permiso', function () {
    $actorWithout = User::factory()->create();

    $actorRead = User::factory()->create();
    grantPermission($actorRead, 'permissions.read');
    $permission = Permission::factory()->create();

    expect(Gate::forUser($actorWithout)->allows('viewAny', Permission::class))->toBeFalse()
        ->and(Gate::forUser($actorRead)->allows('viewAny', Permission::class))->toBeTrue()
        ->and(Gate::forUser($actorRead)->allows('view', $permission))->toBeTrue();

    $actorAssign = User::factory()->create();
    grantPermission($actorAssign, 'permissions.assign');

    expect(Gate::forUser($actorWithout)->allows('assign', Permission::class))->toBeFalse()
        ->and(Gate::forUser($actorAssign)->allows('assign', Permission::class))->toBeTrue();
});
