<?php

use App\Models\Country;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\UserRole;

// Catálogo Maestro "Países" (Batch 1/3, ISO 3166-1 alpha-2) -- gateado por
// CountryPolicy -> User::hasPermission() ('geography.read'/'geography.manage').
// Solo lectura desde la UI/API: sin store/update (catálogo de referencia
// global, no editable), solo index/show/activate/deactivate.

function actorWithGeographyPermission(array $codes): User
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
    Country::factory()->create();

    $noPermission = User::factory()->create();
    $this->actingAs($noPermission)->getJson('/api/admin/countries')->assertForbidden();

    $reader = actorWithGeographyPermission(['geography.read']);
    $this->actingAs($reader)->getJson('/api/admin/countries')->assertOk();
});

test('index filtra por search en iso_code/name', function () {
    Country::factory()->create(['iso_code' => 'CO', 'name' => 'Colombia']);
    Country::factory()->create(['iso_code' => 'PE', 'name' => 'Perú']);
    $actor = actorWithGeographyPermission(['geography.read']);

    $response = $this->actingAs($actor)->getJson('/api/admin/countries?search=Colombia')->assertOk();

    $names = collect($response->json('data'))->pluck('name');
    expect($names)->toContain('Colombia')->not->toContain('Perú');
});

test('index filtra por status active/inactive', function () {
    Country::factory()->create(['iso_code' => 'AA', 'is_active' => true]);
    Country::factory()->create(['iso_code' => 'BB', 'is_active' => false]);
    $actor = actorWithGeographyPermission(['geography.read']);

    $active = collect($this->actingAs($actor)->getJson('/api/admin/countries?status=active')->assertOk()->json('data'))->pluck('iso_code');
    expect($active)->toContain('AA')->not->toContain('BB');
});

test('show devuelve el país', function () {
    $country = Country::factory()->create();
    $actor = actorWithGeographyPermission(['geography.read']);

    $this->actingAs($actor)->getJson("/api/admin/countries/{$country->id}")
        ->assertOk()
        ->assertJsonPath('country.id', $country->id);
});

test('show sin geography.read devuelve 403', function () {
    $country = Country::factory()->create();
    $actor = User::factory()->create();

    $this->actingAs($actor)->getJson("/api/admin/countries/{$country->id}")->assertForbidden();
});

test('activate/deactivate respetan geography.manage y cambian is_active', function () {
    $country = Country::factory()->create(['is_active' => true]);
    $actor = actorWithGeographyPermission(['geography.manage']);

    $this->actingAs($actor)->postJson("/api/admin/countries/{$country->id}/deactivate")
        ->assertOk()
        ->assertJsonPath('country.is_active', false);
    expect($country->fresh()->is_active)->toBeFalse();

    $this->actingAs($actor)->postJson("/api/admin/countries/{$country->id}/activate")
        ->assertOk()
        ->assertJsonPath('country.is_active', true);
    expect($country->fresh()->is_active)->toBeTrue();
});

test('activate/deactivate sin geography.manage devuelven 403', function () {
    $country = Country::factory()->create();
    $actor = User::factory()->create();

    $this->actingAs($actor)->postJson("/api/admin/countries/{$country->id}/activate")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/countries/{$country->id}/deactivate")->assertForbidden();
});
