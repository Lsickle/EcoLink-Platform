<?php

use App\Models\PackagingType;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\UserRole;

// Catálogo Maestro "Tipos de Embalaje" (Batch 3/3, último) -- gateado por
// PackagingTypePolicy -> User::hasPermission()
// ('packaging_types.read'/'packaging_types.manage'). CRUD completo,
// catálogo 100% global (sin tenant_organization_id).

function actorWithPackagingTypePermission(array $codes): User
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

test('index respeta packaging_types.read', function () {
    PackagingType::factory()->create();

    $noPermission = User::factory()->create();
    $this->actingAs($noPermission)->getJson('/api/admin/packaging-types')->assertForbidden();

    $reader = actorWithPackagingTypePermission(['packaging_types.read']);
    $this->actingAs($reader)->getJson('/api/admin/packaging-types')->assertOk();
});

test('index filtra por search en code/name', function () {
    PackagingType::factory()->create(['code' => 'BOLSA', 'name' => 'Bolsa']);
    PackagingType::factory()->create(['code' => 'SACO', 'name' => 'Saco']);
    $actor = actorWithPackagingTypePermission(['packaging_types.read']);

    $response = $this->actingAs($actor)->getJson('/api/admin/packaging-types?search=Bolsa')->assertOk();

    $codes = collect($response->json('data'))->pluck('code');
    expect($codes)->toContain('BOLSA')->not->toContain('SACO');
});

test('index filtra por status active/inactive', function () {
    PackagingType::factory()->create(['code' => 'AA', 'is_active' => true]);
    PackagingType::factory()->create(['code' => 'BB', 'is_active' => false]);
    $actor = actorWithPackagingTypePermission(['packaging_types.read']);

    $active = collect($this->actingAs($actor)->getJson('/api/admin/packaging-types?status=active')->assertOk()->json('data'))->pluck('code');
    expect($active)->toContain('AA')->not->toContain('BB');
});

test('store crea un tipo de embalaje nuevo (packaging_types.manage)', function () {
    $actor = actorWithPackagingTypePermission(['packaging_types.manage']);

    $response = $this->actingAs($actor)->postJson('/api/admin/packaging-types', [
        'code' => 'NEW',
        'name' => 'Embalaje Nuevo',
    ]);

    $response->assertCreated()->assertJsonPath('packaging_type.code', 'NEW');

    $packagingType = PackagingType::query()->where('code', 'NEW')->firstOrFail();
    expect($packagingType->is_active)->toBeTrue()
        ->and($packagingType->is_system)->toBeFalse();
});

test('store sin packaging_types.manage devuelve 403', function () {
    $actor = User::factory()->create();

    $this->actingAs($actor)->postJson('/api/admin/packaging-types', [
        'code' => 'X', 'name' => 'X',
    ])->assertForbidden();
});

test('store rechaza code duplicado', function () {
    PackagingType::factory()->create(['code' => 'DUP']);
    $actor = actorWithPackagingTypePermission(['packaging_types.manage']);

    $this->actingAs($actor)->postJson('/api/admin/packaging-types', [
        'code' => 'DUP', 'name' => 'Otro nombre',
    ])->assertUnprocessable()->assertJsonValidationErrors('code');
});

test('update edita un tipo de embalaje (packaging_types.manage)', function () {
    $packagingType = PackagingType::factory()->create();
    $actor = actorWithPackagingTypePermission(['packaging_types.manage']);

    $this->actingAs($actor)->putJson("/api/admin/packaging-types/{$packagingType->id}", ['name' => 'Nombre editado'])
        ->assertOk()
        ->assertJsonPath('packaging_type.name', 'Nombre editado');
});

test('update sin packaging_types.manage devuelve 403', function () {
    $packagingType = PackagingType::factory()->create();
    $actor = User::factory()->create();

    $this->actingAs($actor)->putJson("/api/admin/packaging-types/{$packagingType->id}", ['name' => 'X'])->assertForbidden();
});

test('activate/deactivate respetan packaging_types.manage y cambian is_active', function () {
    $packagingType = PackagingType::factory()->create(['is_active' => true]);
    $actor = actorWithPackagingTypePermission(['packaging_types.manage']);

    $this->actingAs($actor)->postJson("/api/admin/packaging-types/{$packagingType->id}/deactivate")
        ->assertOk()
        ->assertJsonPath('packaging_type.is_active', false);
    expect($packagingType->fresh()->is_active)->toBeFalse();

    $this->actingAs($actor)->postJson("/api/admin/packaging-types/{$packagingType->id}/activate")
        ->assertOk()
        ->assertJsonPath('packaging_type.is_active', true);
    expect($packagingType->fresh()->is_active)->toBeTrue();
});

test('activate/deactivate sin packaging_types.manage devuelven 403', function () {
    $packagingType = PackagingType::factory()->create();
    $actor = User::factory()->create();

    $this->actingAs($actor)->postJson("/api/admin/packaging-types/{$packagingType->id}/activate")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/packaging-types/{$packagingType->id}/deactivate")->assertForbidden();
});
