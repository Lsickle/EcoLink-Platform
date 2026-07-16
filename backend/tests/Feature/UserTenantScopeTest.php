<?php

use App\Models\Organization;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\UserRole;

// Hallazgo Crítico (especialista-seguridad, 2026-07-13): aislamiento
// cross-tenant -- User::isSameTenantAs() y
// User::tenantHasOtherActiveUserWithPermission().

test('isSameTenantAs compara tenant_organization_id exacto', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $userA1 = User::factory()->create(['tenant_organization_id' => $orgA->id]);
    $userA2 = User::factory()->create(['tenant_organization_id' => $orgA->id]);
    $userB = User::factory()->create(['tenant_organization_id' => $orgB->id]);

    expect($userA1->isSameTenantAs($userA2))->toBeTrue()
        ->and($userA1->isSameTenantAs($userB))->toBeFalse();
});

test('isSameTenantAs trata NULL contra NULL como mismo tenant', function () {
    $userNull1 = User::factory()->create(['tenant_organization_id' => null]);
    $userNull2 = User::factory()->create(['tenant_organization_id' => null]);
    $orgA = Organization::factory()->create();
    $userA = User::factory()->create(['tenant_organization_id' => $orgA->id]);

    expect($userNull1->isSameTenantAs($userNull2))->toBeTrue()
        ->and($userNull1->isSameTenantAs($userA))->toBeFalse();
});

function grantRoleWithPermission(User $user, string $code): void
{
    $role = Role::factory()->create();
    $permission = Permission::factory()->create(['code' => $code]);
    RolePermission::query()->create(['role_id' => $role->id, 'permission_id' => $permission->id, 'is_active' => true]);
    UserRole::query()->create(['user_id' => $user->id, 'role_id' => $role->id, 'is_active' => true]);
}

test('tenantHasOtherActiveUserWithPermission es false cuando nadie más en el tenant tiene el permiso', function () {
    $orgA = Organization::factory()->create();
    $target = User::factory()->create(['tenant_organization_id' => $orgA->id]);

    expect(User::tenantHasOtherActiveUserWithPermission($orgA->id, $target->id, 'users.deactivate'))->toBeFalse();
});

test('tenantHasOtherActiveUserWithPermission es true cuando otro usuario activo del mismo tenant tiene el permiso', function () {
    $orgA = Organization::factory()->create();
    $target = User::factory()->create(['tenant_organization_id' => $orgA->id]);
    $otherAdmin = User::factory()->create(['tenant_organization_id' => $orgA->id]);
    grantRoleWithPermission($otherAdmin, 'users.deactivate');

    expect(User::tenantHasOtherActiveUserWithPermission($orgA->id, $target->id, 'users.deactivate'))->toBeTrue();
});

test('tenantHasOtherActiveUserWithPermission ignora admins de OTRO tenant', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();
    $target = User::factory()->create(['tenant_organization_id' => $orgA->id]);
    $adminOtherTenant = User::factory()->create(['tenant_organization_id' => $orgB->id]);
    grantRoleWithPermission($adminOtherTenant, 'users.deactivate');

    expect(User::tenantHasOtherActiveUserWithPermission($orgA->id, $target->id, 'users.deactivate'))->toBeFalse();
});

test('tenantHasOtherActiveUserWithPermission ignora admins inactivos', function () {
    $orgA = Organization::factory()->create();
    $target = User::factory()->create(['tenant_organization_id' => $orgA->id]);
    $inactiveAdmin = User::factory()->create(['tenant_organization_id' => $orgA->id, 'is_active' => false]);
    grantRoleWithPermission($inactiveAdmin, 'users.deactivate');

    expect(User::tenantHasOtherActiveUserWithPermission($orgA->id, $target->id, 'users.deactivate'))->toBeFalse();
});

test('tenantHasOtherActiveUserWithPermission nunca cuenta al propio usuario excluido', function () {
    $orgA = Organization::factory()->create();
    $target = User::factory()->create(['tenant_organization_id' => $orgA->id]);
    grantRoleWithPermission($target, 'users.deactivate');

    expect(User::tenantHasOtherActiveUserWithPermission($orgA->id, $target->id, 'users.deactivate'))->toBeFalse();
});
