<?php

use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\UserRole;
use App\Models\WasteOperationalStatus;

// Catálogo Maestro "Estado Operativo de Residuo" (Módulo Residuos, núcleo) --
// gateado por WasteOperationalStatusPolicy -> User::hasPermission()
// ('waste_operational_statuses.read'/'waste_operational_statuses.manage').
// CRUD completo, catálogo 100% global -- mismo patrón exacto que
// PhysicalStateController. Distinto de `wastes.status` (workflow de
// declaración BR/DEC/REV/CLS/RCH) -- ver esquema-bd.

function actorWithWasteOperationalStatusPermission(array $codes): User
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

test('index respeta waste_operational_statuses.read', function () {
    WasteOperationalStatus::factory()->create();

    $noPermission = User::factory()->create();
    $this->actingAs($noPermission)->getJson('/api/admin/waste-operational-statuses')->assertForbidden();

    $reader = actorWithWasteOperationalStatusPermission(['waste_operational_statuses.read']);
    $this->actingAs($reader)->getJson('/api/admin/waste-operational-statuses')->assertOk();
});

test('store crea un estado operativo nuevo (waste_operational_statuses.manage)', function () {
    $actor = actorWithWasteOperationalStatusPermission(['waste_operational_statuses.manage']);

    $response = $this->actingAs($actor)->postJson('/api/admin/waste-operational-statuses', [
        'code' => 'NEW',
        'name' => 'Estado Nuevo',
    ]);

    $response->assertCreated()->assertJsonPath('waste_operational_status.code', 'NEW');
});

test('store sin waste_operational_statuses.manage devuelve 403', function () {
    $actor = User::factory()->create();

    $this->actingAs($actor)->postJson('/api/admin/waste-operational-statuses', [
        'code' => 'X', 'name' => 'X',
    ])->assertForbidden();
});

test('store rechaza code duplicado', function () {
    WasteOperationalStatus::factory()->create(['code' => 'DUP']);
    $actor = actorWithWasteOperationalStatusPermission(['waste_operational_statuses.manage']);

    $this->actingAs($actor)->postJson('/api/admin/waste-operational-statuses', [
        'code' => 'DUP', 'name' => 'Otro nombre',
    ])->assertUnprocessable()->assertJsonValidationErrors('code');
});

test('update edita un estado operativo (waste_operational_statuses.manage)', function () {
    $status = WasteOperationalStatus::factory()->create();
    $actor = actorWithWasteOperationalStatusPermission(['waste_operational_statuses.manage']);

    $this->actingAs($actor)->putJson("/api/admin/waste-operational-statuses/{$status->id}", ['name' => 'Nombre editado'])
        ->assertOk()
        ->assertJsonPath('waste_operational_status.name', 'Nombre editado');
});

test('activate/deactivate respetan waste_operational_statuses.manage y cambian is_active', function () {
    $status = WasteOperationalStatus::factory()->create(['is_active' => true]);
    $actor = actorWithWasteOperationalStatusPermission(['waste_operational_statuses.manage']);

    $this->actingAs($actor)->postJson("/api/admin/waste-operational-statuses/{$status->id}/deactivate")
        ->assertOk()
        ->assertJsonPath('waste_operational_status.is_active', false);

    $this->actingAs($actor)->postJson("/api/admin/waste-operational-statuses/{$status->id}/activate")
        ->assertOk()
        ->assertJsonPath('waste_operational_status.is_active', true);
});

test('seed real de 4 valores confirmados', function () {
    $this->seed(\Database\Seeders\WasteOperationalStatusSeeder::class);

    $codes = WasteOperationalStatus::query()->pluck('code')->sort()->values()->all();
    expect($codes)->toBe(['ACTIVE', 'ARCHIVED', 'PENDING', 'SUSPENDED']);
});
