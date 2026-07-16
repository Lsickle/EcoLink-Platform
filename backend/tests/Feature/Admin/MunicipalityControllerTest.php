<?php

use App\Models\Department;
use App\Models\Municipality;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\UserRole;

// Catálogo Maestro "Municipios" (Batch 1/3, DANE) -- gateado por
// MunicipalityPolicy -> User::hasPermission() ('geography.read'/'geography.manage').
// Solo lectura desde la UI/API. `index` filtra en cascada por `department_id`.

function actorWithMunicipalityPermission(array $codes): User
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
    Municipality::factory()->create();

    $noPermission = User::factory()->create();
    $this->actingAs($noPermission)->getJson('/api/admin/municipalities')->assertForbidden();

    $reader = actorWithMunicipalityPermission(['geography.read']);
    $this->actingAs($reader)->getJson('/api/admin/municipalities')->assertOk();
});

test('index filtra en cascada por department_id', function () {
    $antioquia = Department::factory()->create();
    $cundinamarca = Department::factory()->create();

    $ownMunicipality = Municipality::factory()->create(['department_id' => $antioquia->id]);
    $otherMunicipality = Municipality::factory()->create(['department_id' => $cundinamarca->id]);

    $actor = actorWithMunicipalityPermission(['geography.read']);

    $response = $this->actingAs($actor)->getJson("/api/admin/municipalities?department_id={$antioquia->id}")->assertOk();

    $names = collect($response->json('data'))->pluck('name');
    expect($names)->toContain($ownMunicipality->name)->not->toContain($otherMunicipality->name);
});

test('show devuelve el municipio', function () {
    $municipality = Municipality::factory()->create();
    $actor = actorWithMunicipalityPermission(['geography.read']);

    $this->actingAs($actor)->getJson("/api/admin/municipalities/{$municipality->id}")
        ->assertOk()
        ->assertJsonPath('municipality.id', $municipality->id);
});

test('activate/deactivate respetan geography.manage y cambian is_active', function () {
    $municipality = Municipality::factory()->create(['is_active' => true]);
    $actor = actorWithMunicipalityPermission(['geography.manage']);

    $this->actingAs($actor)->postJson("/api/admin/municipalities/{$municipality->id}/deactivate")
        ->assertOk()
        ->assertJsonPath('municipality.is_active', false);

    $this->actingAs($actor)->postJson("/api/admin/municipalities/{$municipality->id}/activate")
        ->assertOk()
        ->assertJsonPath('municipality.is_active', true);
});

test('activate/deactivate sin geography.manage devuelven 403', function () {
    $municipality = Municipality::factory()->create();
    $actor = User::factory()->create();

    $this->actingAs($actor)->postJson("/api/admin/municipalities/{$municipality->id}/activate")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/municipalities/{$municipality->id}/deactivate")->assertForbidden();
});
