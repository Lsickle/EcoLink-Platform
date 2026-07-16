<?php

use App\Models\Country;
use App\Models\Department;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\UserRole;

// Catálogo Maestro "Departamentos" (Batch 1/3, DANE) -- gateado por
// DepartmentPolicy -> User::hasPermission() ('geography.read'/'geography.manage').
// Solo lectura desde la UI/API. `index` filtra en cascada por `country_id`.

function actorWithDepartmentPermission(array $codes): User
{
    $actor = User::factory()->create();
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

test('index respeta geography.read', function () {
    Department::factory()->create();

    $noPermission = User::factory()->create();
    $this->actingAs($noPermission)->getJson('/api/admin/departments')->assertForbidden();

    $reader = actorWithDepartmentPermission(['geography.read']);
    $this->actingAs($reader)->getJson('/api/admin/departments')->assertOk();
});

test('index filtra en cascada por country_id', function () {
    $colombia = Country::factory()->create();
    $peru = Country::factory()->create();

    $ownDepartment = Department::factory()->create(['country_id' => $colombia->id]);
    $otherDepartment = Department::factory()->create(['country_id' => $peru->id]);

    $actor = actorWithDepartmentPermission(['geography.read']);

    $response = $this->actingAs($actor)->getJson("/api/admin/departments?country_id={$colombia->id}")->assertOk();

    $names = collect($response->json('data'))->pluck('name');
    expect($names)->toContain($ownDepartment->name)->not->toContain($otherDepartment->name);
});

test('show devuelve el departamento', function () {
    $department = Department::factory()->create();
    $actor = actorWithDepartmentPermission(['geography.read']);

    $this->actingAs($actor)->getJson("/api/admin/departments/{$department->id}")
        ->assertOk()
        ->assertJsonPath('department.id', $department->id);
});

test('activate/deactivate respetan geography.manage y cambian is_active', function () {
    $department = Department::factory()->create(['is_active' => true]);
    $actor = actorWithDepartmentPermission(['geography.manage']);

    $this->actingAs($actor)->postJson("/api/admin/departments/{$department->id}/deactivate")
        ->assertOk()
        ->assertJsonPath('department.is_active', false);

    $this->actingAs($actor)->postJson("/api/admin/departments/{$department->id}/activate")
        ->assertOk()
        ->assertJsonPath('department.is_active', true);
});

test('activate/deactivate sin geography.manage devuelven 403', function () {
    $department = Department::factory()->create();
    $actor = User::factory()->create();

    $this->actingAs($actor)->postJson("/api/admin/departments/{$department->id}/activate")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/departments/{$department->id}/deactivate")->assertForbidden();
});
