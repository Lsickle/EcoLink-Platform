<?php

use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\UserRole;
use App\Models\VehicleType;

// Catálogo Maestro "Tipos de Vehículo" (Batch 3/3, último; PROVISIONAL, ver
// AVISO en VehicleTypeSeeder) -- gateado por VehicleTypePolicy ->
// User::hasPermission() ('vehicle_types.read'/'vehicle_types.manage'). CRUD
// completo, catálogo 100% global (sin tenant_organization_id). Tabla de
// referencia aislada -- no toca `vehicles.vehicle_type`.

function actorWithVehicleTypePermission(array $codes): User
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

test('index respeta vehicle_types.read', function () {
    VehicleType::factory()->create();

    $noPermission = User::factory()->create();
    $this->actingAs($noPermission)->getJson('/api/admin/vehicle-types')->assertForbidden();

    $reader = actorWithVehicleTypePermission(['vehicle_types.read']);
    $this->actingAs($reader)->getJson('/api/admin/vehicle-types')->assertOk();
});

test('index filtra por search en code/name', function () {
    VehicleType::factory()->create(['code' => 'CAM', 'name' => 'Camión']);
    VehicleType::factory()->create(['code' => 'CISTERNA', 'name' => 'Cisterna']);
    $actor = actorWithVehicleTypePermission(['vehicle_types.read']);

    $response = $this->actingAs($actor)->getJson('/api/admin/vehicle-types?search=Cami')->assertOk();

    $codes = collect($response->json('data'))->pluck('code');
    expect($codes)->toContain('CAM')->not->toContain('CISTERNA');
});

test('index filtra por status active/inactive', function () {
    VehicleType::factory()->create(['code' => 'AA', 'is_active' => true]);
    VehicleType::factory()->create(['code' => 'BB', 'is_active' => false]);
    $actor = actorWithVehicleTypePermission(['vehicle_types.read']);

    $active = collect($this->actingAs($actor)->getJson('/api/admin/vehicle-types?status=active')->assertOk()->json('data'))->pluck('code');
    expect($active)->toContain('AA')->not->toContain('BB');
});

test('store crea un tipo de vehículo nuevo (vehicle_types.manage)', function () {
    $actor = actorWithVehicleTypePermission(['vehicle_types.manage']);

    $response = $this->actingAs($actor)->postJson('/api/admin/vehicle-types', [
        'code' => 'NEW',
        'name' => 'Vehículo Nuevo',
        'category' => 'Especial',
    ]);

    $response->assertCreated()->assertJsonPath('vehicle_type.code', 'NEW');

    $vehicleType = VehicleType::query()->where('code', 'NEW')->firstOrFail();
    expect($vehicleType->is_active)->toBeTrue()
        ->and($vehicleType->is_system)->toBeFalse()
        ->and($vehicleType->category)->toBe('Especial');
});

test('store sin vehicle_types.manage devuelve 403', function () {
    $actor = User::factory()->create();

    $this->actingAs($actor)->postJson('/api/admin/vehicle-types', [
        'code' => 'X', 'name' => 'X',
    ])->assertForbidden();
});

test('store rechaza code duplicado', function () {
    VehicleType::factory()->create(['code' => 'DUP']);
    $actor = actorWithVehicleTypePermission(['vehicle_types.manage']);

    $this->actingAs($actor)->postJson('/api/admin/vehicle-types', [
        'code' => 'DUP', 'name' => 'Otro nombre',
    ])->assertUnprocessable()->assertJsonValidationErrors('code');
});

test('update edita un tipo de vehículo (vehicle_types.manage)', function () {
    $vehicleType = VehicleType::factory()->create();
    $actor = actorWithVehicleTypePermission(['vehicle_types.manage']);

    $this->actingAs($actor)->putJson("/api/admin/vehicle-types/{$vehicleType->id}", ['name' => 'Nombre editado'])
        ->assertOk()
        ->assertJsonPath('vehicle_type.name', 'Nombre editado');
});

test('update sin vehicle_types.manage devuelve 403', function () {
    $vehicleType = VehicleType::factory()->create();
    $actor = User::factory()->create();

    $this->actingAs($actor)->putJson("/api/admin/vehicle-types/{$vehicleType->id}", ['name' => 'X'])->assertForbidden();
});

test('activate/deactivate respetan vehicle_types.manage y cambian is_active', function () {
    $vehicleType = VehicleType::factory()->create(['is_active' => true]);
    $actor = actorWithVehicleTypePermission(['vehicle_types.manage']);

    $this->actingAs($actor)->postJson("/api/admin/vehicle-types/{$vehicleType->id}/deactivate")
        ->assertOk()
        ->assertJsonPath('vehicle_type.is_active', false);
    expect($vehicleType->fresh()->is_active)->toBeFalse();

    $this->actingAs($actor)->postJson("/api/admin/vehicle-types/{$vehicleType->id}/activate")
        ->assertOk()
        ->assertJsonPath('vehicle_type.is_active', true);
    expect($vehicleType->fresh()->is_active)->toBeTrue();
});

test('activate/deactivate sin vehicle_types.manage devuelven 403', function () {
    $vehicleType = VehicleType::factory()->create();
    $actor = User::factory()->create();

    $this->actingAs($actor)->postJson("/api/admin/vehicle-types/{$vehicleType->id}/activate")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/vehicle-types/{$vehicleType->id}/deactivate")->assertForbidden();
});
