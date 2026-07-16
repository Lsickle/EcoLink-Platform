<?php

use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\UserRole;

// RN-028: los permisos se asignan siempre vía roles, nunca directo al
// usuario -- User::hasPermission() recorre user_roles -> roles ->
// role_permissions -> permissions.

function makeRoleWithPermission(string $code): Role
{
    $role = Role::factory()->create();
    $permission = Permission::factory()->create(['code' => $code]);

    RolePermission::query()->create([
        'role_id' => $role->id,
        'permission_id' => $permission->id,
        'is_active' => true,
    ]);

    return $role;
}

test('un usuario sin roles no tiene ningún permiso', function () {
    $user = User::factory()->create();

    expect($user->hasPermission('users.read'))->toBeFalse();
});

test('un usuario con un rol que tiene el permiso lo posee', function () {
    $user = User::factory()->create();
    $role = makeRoleWithPermission('users.read');

    UserRole::query()->create(['user_id' => $user->id, 'role_id' => $role->id, 'is_active' => true]);

    expect($user->hasPermission('users.read'))->toBeTrue()
        ->and($user->hasPermission('users.delete'))->toBeFalse();
});

test('un permiso asignado a un rol distinto al del usuario NO se hereda', function () {
    $user = User::factory()->create();
    $ownRole = makeRoleWithPermission('users.read');
    makeRoleWithPermission('users.delete'); // otro rol, no asignado al usuario

    UserRole::query()->create(['user_id' => $user->id, 'role_id' => $ownRole->id, 'is_active' => true]);

    expect($user->hasPermission('users.delete'))->toBeFalse();
});

test('un user_role con is_active=false no otorga el permiso', function () {
    $user = User::factory()->create();
    $role = makeRoleWithPermission('users.read');

    UserRole::query()->create(['user_id' => $user->id, 'role_id' => $role->id, 'is_active' => false]);

    expect($user->hasPermission('users.read'))->toBeFalse();
});

test('un user_role expirado (expires_at en el pasado) no otorga el permiso', function () {
    $user = User::factory()->create();
    $role = makeRoleWithPermission('users.read');

    UserRole::query()->create([
        'user_id' => $user->id,
        'role_id' => $role->id,
        'is_active' => true,
        'expires_at' => now()->subDay(),
    ]);

    expect($user->hasPermission('users.read'))->toBeFalse();
});

test('un user_role con expires_at en el futuro sí otorga el permiso', function () {
    $user = User::factory()->create();
    $role = makeRoleWithPermission('users.read');

    UserRole::query()->create([
        'user_id' => $user->id,
        'role_id' => $role->id,
        'is_active' => true,
        'expires_at' => now()->addDay(),
    ]);

    expect($user->hasPermission('users.read'))->toBeTrue();
});

test('una role_permission con is_active=false no otorga el permiso', function () {
    $user = User::factory()->create();
    $role = Role::factory()->create();
    $permission = Permission::factory()->create(['code' => 'users.read']);

    RolePermission::query()->create([
        'role_id' => $role->id,
        'permission_id' => $permission->id,
        'is_active' => false,
    ]);

    UserRole::query()->create(['user_id' => $user->id, 'role_id' => $role->id, 'is_active' => true]);

    expect($user->hasPermission('users.read'))->toBeFalse();
});

test('un rol inactivo (roles.is_active=false) no otorga sus permisos aunque el pivote esté activo', function () {
    $user = User::factory()->create();
    $role = makeRoleWithPermission('users.read');
    $role->forceFill(['is_active' => false])->save();

    UserRole::query()->create(['user_id' => $user->id, 'role_id' => $role->id, 'is_active' => true]);

    expect($user->hasPermission('users.read'))->toBeFalse();
});

test('un permiso inactivo (permissions.is_active=false) no se otorga aunque el rol lo tenga asignado', function () {
    $user = User::factory()->create();
    $role = Role::factory()->create();
    $permission = Permission::factory()->create(['code' => 'users.read', 'is_active' => false]);

    RolePermission::query()->create(['role_id' => $role->id, 'permission_id' => $permission->id, 'is_active' => true]);
    UserRole::query()->create(['user_id' => $user->id, 'role_id' => $role->id, 'is_active' => true]);

    expect($user->hasPermission('users.read'))->toBeFalse();
});

test('un usuario con múltiples roles posee la unión de los permisos de todos sus roles', function () {
    $user = User::factory()->create();
    $roleA = makeRoleWithPermission('users.read');
    $roleB = makeRoleWithPermission('users.delete');

    UserRole::query()->create(['user_id' => $user->id, 'role_id' => $roleA->id, 'is_active' => true]);
    UserRole::query()->create(['user_id' => $user->id, 'role_id' => $roleB->id, 'is_active' => true]);

    expect($user->hasPermission('users.read'))->toBeTrue()
        ->and($user->hasPermission('users.delete'))->toBeTrue();
});
