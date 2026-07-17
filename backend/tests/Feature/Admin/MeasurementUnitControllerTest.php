<?php

use App\Models\MeasurementUnit;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\UserRole;

// Catálogo Maestro "Unidad de Medida" (Módulo Residuos, núcleo) -- gateado
// por MeasurementUnitPolicy -> User::hasPermission()
// ('measurement_units.read'/'measurement_units.manage'). CRUD completo,
// catálogo 100% global -- mismo patrón exacto que PhysicalStateController.

function actorWithMeasurementUnitPermission(array $codes): User
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

test('index respeta measurement_units.read', function () {
    MeasurementUnit::factory()->create();

    $noPermission = User::factory()->create();
    $this->actingAs($noPermission)->getJson('/api/admin/measurement-units')->assertForbidden();

    $reader = actorWithMeasurementUnitPermission(['measurement_units.read']);
    $this->actingAs($reader)->getJson('/api/admin/measurement-units')->assertOk();
});

test('store crea una unidad de medida nueva (measurement_units.manage)', function () {
    $actor = actorWithMeasurementUnitPermission(['measurement_units.manage']);

    $response = $this->actingAs($actor)->postJson('/api/admin/measurement-units', [
        'code' => 'NEW',
        'name' => 'Unidad Nueva',
    ]);

    $response->assertCreated()->assertJsonPath('measurement_unit.code', 'NEW');
});

test('store sin measurement_units.manage devuelve 403', function () {
    $actor = User::factory()->create();

    $this->actingAs($actor)->postJson('/api/admin/measurement-units', [
        'code' => 'X', 'name' => 'X',
    ])->assertForbidden();
});

test('store rechaza code duplicado', function () {
    MeasurementUnit::factory()->create(['code' => 'DUP']);
    $actor = actorWithMeasurementUnitPermission(['measurement_units.manage']);

    $this->actingAs($actor)->postJson('/api/admin/measurement-units', [
        'code' => 'DUP', 'name' => 'Otro nombre',
    ])->assertUnprocessable()->assertJsonValidationErrors('code');
});

test('update edita una unidad de medida (measurement_units.manage)', function () {
    $measurementUnit = MeasurementUnit::factory()->create();
    $actor = actorWithMeasurementUnitPermission(['measurement_units.manage']);

    $this->actingAs($actor)->putJson("/api/admin/measurement-units/{$measurementUnit->id}", ['name' => 'Nombre editado'])
        ->assertOk()
        ->assertJsonPath('measurement_unit.name', 'Nombre editado');
});

test('activate/deactivate respetan measurement_units.manage y cambian is_active', function () {
    $measurementUnit = MeasurementUnit::factory()->create(['is_active' => true]);
    $actor = actorWithMeasurementUnitPermission(['measurement_units.manage']);

    $this->actingAs($actor)->postJson("/api/admin/measurement-units/{$measurementUnit->id}/deactivate")
        ->assertOk()
        ->assertJsonPath('measurement_unit.is_active', false);

    $this->actingAs($actor)->postJson("/api/admin/measurement-units/{$measurementUnit->id}/activate")
        ->assertOk()
        ->assertJsonPath('measurement_unit.is_active', true);
});

test('seed real de 5 valores confirmados', function () {
    $this->seed(\Database\Seeders\MeasurementUnitSeeder::class);

    $codes = MeasurementUnit::query()->pluck('code')->sort()->values()->all();
    expect($codes)->toBe(['KG', 'LB', 'LT', 'M3', 'TON']);
});
