<?php

use App\Models\BranchType;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\UserRole;

// Catálogo Maestro "Tipos de Sede" (Batch 1/3) -- gateado por
// BranchTypePolicy -> User::hasPermission() ('branch_types.read'/
// 'branch_types.manage'). CRUD completo, catálogo 100% global (sin
// tenant_organization_id en branch_types).

function actorWithBranchTypePermission(array $codes): User
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

test('index respeta branch_types.read', function () {
    BranchType::factory()->create();

    $noPermission = User::factory()->create();
    $this->actingAs($noPermission)->getJson('/api/admin/branch-types')->assertForbidden();

    $reader = actorWithBranchTypePermission(['branch_types.read']);
    $this->actingAs($reader)->getJson('/api/admin/branch-types')->assertOk();
});

test('index filtra por search en code/name', function () {
    BranchType::factory()->create(['code' => 'ADM', 'name' => 'Administrativa']);
    BranchType::factory()->create(['code' => 'PLT', 'name' => 'Planta']);
    $actor = actorWithBranchTypePermission(['branch_types.read']);

    $response = $this->actingAs($actor)->getJson('/api/admin/branch-types?search=Planta')->assertOk();

    $codes = collect($response->json('data'))->pluck('code');
    expect($codes)->toContain('PLT')->not->toContain('ADM');
});

test('index filtra por status active/inactive', function () {
    BranchType::factory()->create(['code' => 'AA', 'is_active' => true]);
    BranchType::factory()->create(['code' => 'BB', 'is_active' => false]);
    $actor = actorWithBranchTypePermission(['branch_types.read']);

    $active = collect($this->actingAs($actor)->getJson('/api/admin/branch-types?status=active')->assertOk()->json('data'))->pluck('code');
    expect($active)->toContain('AA')->not->toContain('BB');
});

test('store crea un tipo de sede nuevo (branch_types.manage)', function () {
    $actor = actorWithBranchTypePermission(['branch_types.manage']);

    $response = $this->actingAs($actor)->postJson('/api/admin/branch-types', [
        'code' => 'NEW',
        'name' => 'Tipo Nuevo',
        'category' => 'Operativa',
        'is_storage' => true,
    ]);

    $response->assertCreated()->assertJsonPath('branch_type.code', 'NEW');

    $branchType = BranchType::query()->where('code', 'NEW')->firstOrFail();
    expect($branchType->is_active)->toBeTrue()
        ->and($branchType->is_storage)->toBeTrue();
});

test('store sin branch_types.manage devuelve 403', function () {
    $actor = User::factory()->create();

    $this->actingAs($actor)->postJson('/api/admin/branch-types', [
        'code' => 'X', 'name' => 'X', 'category' => 'X',
    ])->assertForbidden();
});

test('store rechaza code duplicado', function () {
    BranchType::factory()->create(['code' => 'DUP']);
    $actor = actorWithBranchTypePermission(['branch_types.manage']);

    $this->actingAs($actor)->postJson('/api/admin/branch-types', [
        'code' => 'DUP', 'name' => 'Otro nombre', 'category' => 'Operativa',
    ])->assertUnprocessable()->assertJsonValidationErrors('code');
});

test('update edita un tipo de sede (branch_types.manage)', function () {
    $branchType = BranchType::factory()->create();
    $actor = actorWithBranchTypePermission(['branch_types.manage']);

    $this->actingAs($actor)->putJson("/api/admin/branch-types/{$branchType->id}", ['name' => 'Nombre editado'])
        ->assertOk()
        ->assertJsonPath('branch_type.name', 'Nombre editado');
});

test('update sin branch_types.manage devuelve 403', function () {
    $branchType = BranchType::factory()->create();
    $actor = User::factory()->create();

    $this->actingAs($actor)->putJson("/api/admin/branch-types/{$branchType->id}", ['name' => 'X'])->assertForbidden();
});

test('activate/deactivate respetan branch_types.manage y cambian is_active', function () {
    $branchType = BranchType::factory()->create(['is_active' => true]);
    $actor = actorWithBranchTypePermission(['branch_types.manage']);

    $this->actingAs($actor)->postJson("/api/admin/branch-types/{$branchType->id}/deactivate")
        ->assertOk()
        ->assertJsonPath('branch_type.is_active', false);
    expect($branchType->fresh()->is_active)->toBeFalse();

    $this->actingAs($actor)->postJson("/api/admin/branch-types/{$branchType->id}/activate")
        ->assertOk()
        ->assertJsonPath('branch_type.is_active', true);
    expect($branchType->fresh()->is_active)->toBeTrue();
});

test('activate/deactivate sin branch_types.manage devuelven 403', function () {
    $branchType = BranchType::factory()->create();
    $actor = User::factory()->create();

    $this->actingAs($actor)->postJson("/api/admin/branch-types/{$branchType->id}/activate")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/branch-types/{$branchType->id}/deactivate")->assertForbidden();
});
