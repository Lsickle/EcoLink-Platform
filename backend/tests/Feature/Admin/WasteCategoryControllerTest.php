<?php

use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\UserRole;
use App\Models\WasteCategory;

// Catálogo Maestro "Categoría de Residuo" (Batch 2/3) -- gateado por
// WasteCategoryPolicy -> User::hasPermission()
// ('waste_categories.read'/'waste_categories.manage'). CRUD completo,
// catálogo 100% global (sin tenant_organization_id/organization_id, D-R05).

function actorWithWasteCategoryPermission(array $codes): User
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

test('index respeta waste_categories.read', function () {
    WasteCategory::factory()->create();

    $noPermission = User::factory()->create();
    $this->actingAs($noPermission)->getJson('/api/admin/waste-categories')->assertForbidden();

    $reader = actorWithWasteCategoryPermission(['waste_categories.read']);
    $this->actingAs($reader)->getJson('/api/admin/waste-categories')->assertOk();
});

test('index filtra por search en code/name', function () {
    WasteCategory::factory()->create(['code' => 'INDUSTRIAL', 'name' => 'INDUSTRIAL']);
    WasteCategory::factory()->create(['code' => 'RCD', 'name' => 'RCD']);
    $actor = actorWithWasteCategoryPermission(['waste_categories.read']);

    $response = $this->actingAs($actor)->getJson('/api/admin/waste-categories?search=INDUSTRIAL')->assertOk();

    $codes = collect($response->json('data'))->pluck('code');
    expect($codes)->toContain('INDUSTRIAL')->not->toContain('RCD');
});

test('index filtra por status active/inactive', function () {
    WasteCategory::factory()->create(['code' => 'AA', 'is_active' => true]);
    WasteCategory::factory()->create(['code' => 'BB', 'is_active' => false]);
    $actor = actorWithWasteCategoryPermission(['waste_categories.read']);

    $active = collect($this->actingAs($actor)->getJson('/api/admin/waste-categories?status=active')->assertOk()->json('data'))->pluck('code');
    expect($active)->toContain('AA')->not->toContain('BB');
});

test('store crea una categoría de residuo nueva (waste_categories.manage)', function () {
    $actor = actorWithWasteCategoryPermission(['waste_categories.manage']);

    $response = $this->actingAs($actor)->postJson('/api/admin/waste-categories', [
        'code' => 'NEW',
        'name' => 'Categoría Nueva',
        'description' => 'Descripción de prueba',
    ]);

    $response->assertCreated()->assertJsonPath('waste_category.code', 'NEW');

    $wasteCategory = WasteCategory::query()->where('code', 'NEW')->firstOrFail();
    expect($wasteCategory->is_active)->toBeTrue()
        ->and($wasteCategory->is_system)->toBeFalse();
});

test('store sin waste_categories.manage devuelve 403', function () {
    $actor = User::factory()->create();

    $this->actingAs($actor)->postJson('/api/admin/waste-categories', [
        'code' => 'X', 'name' => 'X',
    ])->assertForbidden();
});

test('store rechaza code duplicado', function () {
    WasteCategory::factory()->create(['code' => 'DUP']);
    $actor = actorWithWasteCategoryPermission(['waste_categories.manage']);

    $this->actingAs($actor)->postJson('/api/admin/waste-categories', [
        'code' => 'DUP', 'name' => 'Otro nombre',
    ])->assertUnprocessable()->assertJsonValidationErrors('code');
});

test('update edita una categoría de residuo (waste_categories.manage)', function () {
    $wasteCategory = WasteCategory::factory()->create();
    $actor = actorWithWasteCategoryPermission(['waste_categories.manage']);

    $this->actingAs($actor)->putJson("/api/admin/waste-categories/{$wasteCategory->id}", ['name' => 'Nombre editado'])
        ->assertOk()
        ->assertJsonPath('waste_category.name', 'Nombre editado');
});

test('update sin waste_categories.manage devuelve 403', function () {
    $wasteCategory = WasteCategory::factory()->create();
    $actor = User::factory()->create();

    $this->actingAs($actor)->putJson("/api/admin/waste-categories/{$wasteCategory->id}", ['name' => 'X'])->assertForbidden();
});

test('activate/deactivate respetan waste_categories.manage y cambian is_active', function () {
    $wasteCategory = WasteCategory::factory()->create(['is_active' => true]);
    $actor = actorWithWasteCategoryPermission(['waste_categories.manage']);

    $this->actingAs($actor)->postJson("/api/admin/waste-categories/{$wasteCategory->id}/deactivate")
        ->assertOk()
        ->assertJsonPath('waste_category.is_active', false);
    expect($wasteCategory->fresh()->is_active)->toBeFalse();

    $this->actingAs($actor)->postJson("/api/admin/waste-categories/{$wasteCategory->id}/activate")
        ->assertOk()
        ->assertJsonPath('waste_category.is_active', true);
    expect($wasteCategory->fresh()->is_active)->toBeTrue();
});

test('activate/deactivate sin waste_categories.manage devuelven 403', function () {
    $wasteCategory = WasteCategory::factory()->create();
    $actor = User::factory()->create();

    $this->actingAs($actor)->postJson("/api/admin/waste-categories/{$wasteCategory->id}/activate")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/waste-categories/{$wasteCategory->id}/deactivate")->assertForbidden();
});
