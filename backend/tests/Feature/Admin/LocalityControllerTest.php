<?php

use App\Models\Locality;
use App\Models\Municipality;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\UserRole;

// Catálogo Maestro "Localidades" (Batch 1/3, solo Bogotá D.C. en la
// práctica) -- gateado por LocalityPolicy -> User::hasPermission()
// ('geography.read'/'geography.manage'). Solo lectura desde la UI/API.
// `index` filtra en cascada por `municipality_id`.

function actorWithLocalityPermission(array $codes): User
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
    Locality::factory()->create();

    $noPermission = User::factory()->create();
    $this->actingAs($noPermission)->getJson('/api/admin/localities')->assertForbidden();

    $reader = actorWithLocalityPermission(['geography.read']);
    $this->actingAs($reader)->getJson('/api/admin/localities')->assertOk();
});

test('index filtra en cascada por municipality_id', function () {
    $bogota = Municipality::factory()->create();
    $otherMunicipality = Municipality::factory()->create();

    $ownLocality = Locality::factory()->create(['municipality_id' => $bogota->id]);
    $otherLocality = Locality::factory()->create(['municipality_id' => $otherMunicipality->id]);

    $actor = actorWithLocalityPermission(['geography.read']);

    $response = $this->actingAs($actor)->getJson("/api/admin/localities?municipality_id={$bogota->id}")->assertOk();

    $names = collect($response->json('data'))->pluck('name');
    expect($names)->toContain($ownLocality->name)->not->toContain($otherLocality->name);
});

test('show devuelve la localidad', function () {
    $locality = Locality::factory()->create();
    $actor = actorWithLocalityPermission(['geography.read']);

    $this->actingAs($actor)->getJson("/api/admin/localities/{$locality->id}")
        ->assertOk()
        ->assertJsonPath('locality.id', $locality->id);
});

test('activate/deactivate respetan geography.manage y cambian is_active', function () {
    $locality = Locality::factory()->create(['is_active' => true]);
    $actor = actorWithLocalityPermission(['geography.manage']);

    $this->actingAs($actor)->postJson("/api/admin/localities/{$locality->id}/deactivate")
        ->assertOk()
        ->assertJsonPath('locality.is_active', false);

    $this->actingAs($actor)->postJson("/api/admin/localities/{$locality->id}/activate")
        ->assertOk()
        ->assertJsonPath('locality.is_active', true);
});

test('activate/deactivate sin geography.manage devuelven 403', function () {
    $locality = Locality::factory()->create();
    $actor = User::factory()->create();

    $this->actingAs($actor)->postJson("/api/admin/localities/{$locality->id}/activate")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/localities/{$locality->id}/deactivate")->assertForbidden();
});
