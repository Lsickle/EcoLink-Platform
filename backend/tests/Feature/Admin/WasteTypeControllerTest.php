<?php

use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\UserRole;
use App\Models\WasteType;

// Catálogo Maestro "Tipo de Residuo" (Módulo Residuos, núcleo) -- gateado por
// WasteTypePolicy -> User::hasPermission()
// ('waste_types.read'/'waste_types.manage'). CRUD completo, catálogo 100%
// global (sin tenant_organization_id) -- mismo patrón exacto que
// PhysicalStateController.

function actorWithWasteTypePermission(array $codes): User
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

test('index respeta waste_types.read', function () {
    WasteType::factory()->create();

    $noPermission = User::factory()->create();
    $this->actingAs($noPermission)->getJson('/api/admin/waste-types')->assertForbidden();

    $reader = actorWithWasteTypePermission(['waste_types.read']);
    $this->actingAs($reader)->getJson('/api/admin/waste-types')->assertOk();
});

test('index filtra por search en code/name', function () {
    WasteType::factory()->create(['code' => 'OPERATIONAL', 'name' => 'Operacional']);
    WasteType::factory()->create(['code' => 'COMMON', 'name' => 'Común']);
    $actor = actorWithWasteTypePermission(['waste_types.read']);

    $response = $this->actingAs($actor)->getJson('/api/admin/waste-types?search=Operacional')->assertOk();

    $codes = collect($response->json('data'))->pluck('code');
    expect($codes)->toContain('OPERATIONAL')->not->toContain('COMMON');
});

test('store crea un tipo de residuo nuevo (waste_types.manage)', function () {
    $actor = actorWithWasteTypePermission(['waste_types.manage']);

    $response = $this->actingAs($actor)->postJson('/api/admin/waste-types', [
        'code' => 'NEW',
        'name' => 'Tipo Nuevo',
    ]);

    $response->assertCreated()->assertJsonPath('waste_type.code', 'NEW');

    $wasteType = WasteType::query()->where('code', 'NEW')->firstOrFail();
    expect($wasteType->is_active)->toBeTrue()
        ->and($wasteType->is_system)->toBeFalse();
});

test('store sin waste_types.manage devuelve 403', function () {
    $actor = User::factory()->create();

    $this->actingAs($actor)->postJson('/api/admin/waste-types', [
        'code' => 'X', 'name' => 'X',
    ])->assertForbidden();
});

test('store rechaza code duplicado', function () {
    WasteType::factory()->create(['code' => 'DUP']);
    $actor = actorWithWasteTypePermission(['waste_types.manage']);

    $this->actingAs($actor)->postJson('/api/admin/waste-types', [
        'code' => 'DUP', 'name' => 'Otro nombre',
    ])->assertUnprocessable()->assertJsonValidationErrors('code');
});

test('update edita un tipo de residuo (waste_types.manage)', function () {
    $wasteType = WasteType::factory()->create();
    $actor = actorWithWasteTypePermission(['waste_types.manage']);

    $this->actingAs($actor)->putJson("/api/admin/waste-types/{$wasteType->id}", ['name' => 'Nombre editado'])
        ->assertOk()
        ->assertJsonPath('waste_type.name', 'Nombre editado');
});

test('activate/deactivate respetan waste_types.manage y cambian is_active', function () {
    $wasteType = WasteType::factory()->create(['is_active' => true]);
    $actor = actorWithWasteTypePermission(['waste_types.manage']);

    $this->actingAs($actor)->postJson("/api/admin/waste-types/{$wasteType->id}/deactivate")
        ->assertOk()
        ->assertJsonPath('waste_type.is_active', false);

    $this->actingAs($actor)->postJson("/api/admin/waste-types/{$wasteType->id}/activate")
        ->assertOk()
        ->assertJsonPath('waste_type.is_active', true);
});

test('seed real de 5 valores confirmados', function () {
    $this->seed(\Database\Seeders\WasteTypeSeeder::class);

    $codes = WasteType::query()->pluck('code')->sort()->values()->all();
    expect($codes)->toBe(['COMMON', 'OPERATIONAL', 'PREAPPROVED', 'TEMPLATE', 'TEMPORARY']);
});
