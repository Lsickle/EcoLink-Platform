<?php

use App\Models\HazardCharacteristic;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\UserRole;

// Catálogo Maestro "Características de Peligrosidad" (Batch 2/3) --
// gateado por HazardCharacteristicPolicy -> User::hasPermission()
// ('hazard_characteristics.read'/'hazard_characteristics.manage'). CRUD
// completo, catálogo 100% global (sin tenant_organization_id).

function actorWithHazardCharacteristicPermission(array $codes): User
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

test('index respeta hazard_characteristics.read', function () {
    HazardCharacteristic::factory()->create();

    $noPermission = User::factory()->create();
    $this->actingAs($noPermission)->getJson('/api/admin/hazard-characteristics')->assertForbidden();

    $reader = actorWithHazardCharacteristicPermission(['hazard_characteristics.read']);
    $this->actingAs($reader)->getJson('/api/admin/hazard-characteristics')->assertOk();
});

test('index filtra por search en code/name', function () {
    HazardCharacteristic::factory()->create(['code' => 'COR', 'name' => 'CORROSIVO', 'risk_level' => 5]);
    HazardCharacteristic::factory()->create(['code' => 'TOX', 'name' => 'TOXICO', 'risk_level' => 7]);
    $actor = actorWithHazardCharacteristicPermission(['hazard_characteristics.read']);

    $response = $this->actingAs($actor)->getJson('/api/admin/hazard-characteristics?search=CORROSIVO')->assertOk();

    $codes = collect($response->json('data'))->pluck('code');
    expect($codes)->toContain('COR')->not->toContain('TOX');
});

test('index filtra por status active/inactive', function () {
    HazardCharacteristic::factory()->create(['code' => 'AA', 'is_active' => true]);
    HazardCharacteristic::factory()->create(['code' => 'BB', 'is_active' => false]);
    $actor = actorWithHazardCharacteristicPermission(['hazard_characteristics.read']);

    $active = collect($this->actingAs($actor)->getJson('/api/admin/hazard-characteristics?status=active')->assertOk()->json('data'))->pluck('code');
    expect($active)->toContain('AA')->not->toContain('BB');
});

test('index expone risk_level y permite ordenar descendente (mayor riesgo primero)', function () {
    HazardCharacteristic::factory()->create(['code' => 'LOW', 'risk_level' => 1]);
    HazardCharacteristic::factory()->create(['code' => 'HIGH', 'risk_level' => 9]);
    HazardCharacteristic::factory()->create(['code' => 'MID', 'risk_level' => 5]);
    $actor = actorWithHazardCharacteristicPermission(['hazard_characteristics.read']);

    $response = $this->actingAs($actor)
        ->getJson('/api/admin/hazard-characteristics?sort=risk_level&direction=desc')
        ->assertOk();

    $rows = collect($response->json('data'));
    expect($rows->first())->toHaveKey('risk_level');

    $riskLevels = $rows->pluck('risk_level')->values()->all();
    $sortedDesc = collect($riskLevels)->sortDesc()->values()->all();
    expect($riskLevels)->toBe($sortedDesc);
});

test('store crea una característica de peligrosidad nueva (hazard_characteristics.manage)', function () {
    $actor = actorWithHazardCharacteristicPermission(['hazard_characteristics.manage']);

    $response = $this->actingAs($actor)->postJson('/api/admin/hazard-characteristics', [
        'code' => 'NEW',
        'name' => 'Nueva Característica',
        'risk_level' => 3,
    ]);

    $response->assertCreated()->assertJsonPath('hazard_characteristic.code', 'NEW');

    $hazardCharacteristic = HazardCharacteristic::query()->where('code', 'NEW')->firstOrFail();
    expect($hazardCharacteristic->is_active)->toBeTrue()
        ->and($hazardCharacteristic->is_system)->toBeFalse()
        ->and($hazardCharacteristic->risk_level)->toBe(3);
});

test('store sin hazard_characteristics.manage devuelve 403', function () {
    $actor = User::factory()->create();

    $this->actingAs($actor)->postJson('/api/admin/hazard-characteristics', [
        'code' => 'X', 'name' => 'X', 'risk_level' => 1,
    ])->assertForbidden();
});

test('store rechaza code duplicado', function () {
    HazardCharacteristic::factory()->create(['code' => 'DUP']);
    $actor = actorWithHazardCharacteristicPermission(['hazard_characteristics.manage']);

    $this->actingAs($actor)->postJson('/api/admin/hazard-characteristics', [
        'code' => 'DUP', 'name' => 'Otro nombre', 'risk_level' => 1,
    ])->assertUnprocessable()->assertJsonValidationErrors('code');
});

test('store rechaza risk_level fuera de rango', function () {
    $actor = actorWithHazardCharacteristicPermission(['hazard_characteristics.manage']);

    $this->actingAs($actor)->postJson('/api/admin/hazard-characteristics', [
        'code' => 'BAD', 'name' => 'Bad', 'risk_level' => 10,
    ])->assertUnprocessable()->assertJsonValidationErrors('risk_level');
});

test('update edita una característica de peligrosidad (hazard_characteristics.manage)', function () {
    $hazardCharacteristic = HazardCharacteristic::factory()->create();
    $actor = actorWithHazardCharacteristicPermission(['hazard_characteristics.manage']);

    $this->actingAs($actor)->putJson("/api/admin/hazard-characteristics/{$hazardCharacteristic->id}", ['name' => 'Nombre editado'])
        ->assertOk()
        ->assertJsonPath('hazard_characteristic.name', 'Nombre editado');
});

test('update sin hazard_characteristics.manage devuelve 403', function () {
    $hazardCharacteristic = HazardCharacteristic::factory()->create();
    $actor = User::factory()->create();

    $this->actingAs($actor)->putJson("/api/admin/hazard-characteristics/{$hazardCharacteristic->id}", ['name' => 'X'])->assertForbidden();
});

test('activate/deactivate respetan hazard_characteristics.manage y cambian is_active', function () {
    $hazardCharacteristic = HazardCharacteristic::factory()->create(['is_active' => true]);
    $actor = actorWithHazardCharacteristicPermission(['hazard_characteristics.manage']);

    $this->actingAs($actor)->postJson("/api/admin/hazard-characteristics/{$hazardCharacteristic->id}/deactivate")
        ->assertOk()
        ->assertJsonPath('hazard_characteristic.is_active', false);
    expect($hazardCharacteristic->fresh()->is_active)->toBeFalse();

    $this->actingAs($actor)->postJson("/api/admin/hazard-characteristics/{$hazardCharacteristic->id}/activate")
        ->assertOk()
        ->assertJsonPath('hazard_characteristic.is_active', true);
    expect($hazardCharacteristic->fresh()->is_active)->toBeTrue();
});

test('activate/deactivate sin hazard_characteristics.manage devuelven 403', function () {
    $hazardCharacteristic = HazardCharacteristic::factory()->create();
    $actor = User::factory()->create();

    $this->actingAs($actor)->postJson("/api/admin/hazard-characteristics/{$hazardCharacteristic->id}/activate")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/hazard-characteristics/{$hazardCharacteristic->id}/deactivate")->assertForbidden();
});
