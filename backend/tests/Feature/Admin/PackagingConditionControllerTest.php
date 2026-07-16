<?php

use App\Models\PackagingCondition;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\UserRole;

// Catálogo Maestro "Estados del Embalaje" (Batch 3/3, último; PROVISIONAL,
// ver AVISO en PackagingConditionSeeder) -- gateado por
// PackagingConditionPolicy -> User::hasPermission()
// ('packaging_conditions.read'/'packaging_conditions.manage'). CRUD
// completo, catálogo 100% global (sin tenant_organization_id).

function actorWithPackagingConditionPermission(array $codes): User
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

test('index respeta packaging_conditions.read', function () {
    PackagingCondition::factory()->create();

    $noPermission = User::factory()->create();
    $this->actingAs($noPermission)->getJson('/api/admin/packaging-conditions')->assertForbidden();

    $reader = actorWithPackagingConditionPermission(['packaging_conditions.read']);
    $this->actingAs($reader)->getJson('/api/admin/packaging-conditions')->assertOk();
});

test('index filtra por search en code/name', function () {
    PackagingCondition::factory()->create(['code' => 'BUENO', 'name' => 'Bueno', 'risk_level' => 1]);
    PackagingCondition::factory()->create(['code' => 'DETERIORADO', 'name' => 'Deteriorado', 'risk_level' => 9]);
    $actor = actorWithPackagingConditionPermission(['packaging_conditions.read']);

    $response = $this->actingAs($actor)->getJson('/api/admin/packaging-conditions?search=Bueno')->assertOk();

    $codes = collect($response->json('data'))->pluck('code');
    expect($codes)->toContain('BUENO')->not->toContain('DETERIORADO');
});

test('index filtra por status active/inactive', function () {
    PackagingCondition::factory()->create(['code' => 'AA', 'is_active' => true]);
    PackagingCondition::factory()->create(['code' => 'BB', 'is_active' => false]);
    $actor = actorWithPackagingConditionPermission(['packaging_conditions.read']);

    $active = collect($this->actingAs($actor)->getJson('/api/admin/packaging-conditions?status=active')->assertOk()->json('data'))->pluck('code');
    expect($active)->toContain('AA')->not->toContain('BB');
});

test('index expone risk_level y permite ordenar descendente (mayor riesgo primero)', function () {
    PackagingCondition::factory()->create(['code' => 'LOW', 'risk_level' => 1]);
    PackagingCondition::factory()->create(['code' => 'HIGH', 'risk_level' => 9]);
    PackagingCondition::factory()->create(['code' => 'MID', 'risk_level' => 5]);
    $actor = actorWithPackagingConditionPermission(['packaging_conditions.read']);

    $response = $this->actingAs($actor)
        ->getJson('/api/admin/packaging-conditions?sort=risk_level&direction=desc')
        ->assertOk();

    $rows = collect($response->json('data'));
    expect($rows->first())->toHaveKey('risk_level');

    $riskLevels = $rows->pluck('risk_level')->values()->all();
    $sortedDesc = collect($riskLevels)->sortDesc()->values()->all();
    expect($riskLevels)->toBe($sortedDesc);
});

test('store crea un estado de embalaje nuevo (packaging_conditions.manage)', function () {
    $actor = actorWithPackagingConditionPermission(['packaging_conditions.manage']);

    $response = $this->actingAs($actor)->postJson('/api/admin/packaging-conditions', [
        'code' => 'NEW',
        'name' => 'Estado Nuevo',
        'risk_level' => 3,
    ]);

    $response->assertCreated()->assertJsonPath('packaging_condition.code', 'NEW');

    $packagingCondition = PackagingCondition::query()->where('code', 'NEW')->firstOrFail();
    expect($packagingCondition->is_active)->toBeTrue()
        ->and($packagingCondition->is_system)->toBeFalse()
        ->and($packagingCondition->risk_level)->toBe(3);
});

test('store sin packaging_conditions.manage devuelve 403', function () {
    $actor = User::factory()->create();

    $this->actingAs($actor)->postJson('/api/admin/packaging-conditions', [
        'code' => 'X', 'name' => 'X',
    ])->assertForbidden();
});

test('store rechaza code duplicado', function () {
    PackagingCondition::factory()->create(['code' => 'DUP']);
    $actor = actorWithPackagingConditionPermission(['packaging_conditions.manage']);

    $this->actingAs($actor)->postJson('/api/admin/packaging-conditions', [
        'code' => 'DUP', 'name' => 'Otro nombre',
    ])->assertUnprocessable()->assertJsonValidationErrors('code');
});

test('store rechaza risk_level fuera de rango', function () {
    $actor = actorWithPackagingConditionPermission(['packaging_conditions.manage']);

    $this->actingAs($actor)->postJson('/api/admin/packaging-conditions', [
        'code' => 'BAD', 'name' => 'Bad', 'risk_level' => 10,
    ])->assertUnprocessable()->assertJsonValidationErrors('risk_level');
});

test('store acepta risk_level nulo', function () {
    $actor = actorWithPackagingConditionPermission(['packaging_conditions.manage']);

    $response = $this->actingAs($actor)->postJson('/api/admin/packaging-conditions', [
        'code' => 'NORISK', 'name' => 'Sin riesgo asignado',
    ]);

    $response->assertCreated();
    expect(PackagingCondition::query()->where('code', 'NORISK')->firstOrFail()->risk_level)->toBeNull();
});

test('update edita un estado de embalaje (packaging_conditions.manage)', function () {
    $packagingCondition = PackagingCondition::factory()->create();
    $actor = actorWithPackagingConditionPermission(['packaging_conditions.manage']);

    $this->actingAs($actor)->putJson("/api/admin/packaging-conditions/{$packagingCondition->id}", ['name' => 'Nombre editado'])
        ->assertOk()
        ->assertJsonPath('packaging_condition.name', 'Nombre editado');
});

test('update sin packaging_conditions.manage devuelve 403', function () {
    $packagingCondition = PackagingCondition::factory()->create();
    $actor = User::factory()->create();

    $this->actingAs($actor)->putJson("/api/admin/packaging-conditions/{$packagingCondition->id}", ['name' => 'X'])->assertForbidden();
});

test('activate/deactivate respetan packaging_conditions.manage y cambian is_active', function () {
    $packagingCondition = PackagingCondition::factory()->create(['is_active' => true]);
    $actor = actorWithPackagingConditionPermission(['packaging_conditions.manage']);

    $this->actingAs($actor)->postJson("/api/admin/packaging-conditions/{$packagingCondition->id}/deactivate")
        ->assertOk()
        ->assertJsonPath('packaging_condition.is_active', false);
    expect($packagingCondition->fresh()->is_active)->toBeFalse();

    $this->actingAs($actor)->postJson("/api/admin/packaging-conditions/{$packagingCondition->id}/activate")
        ->assertOk()
        ->assertJsonPath('packaging_condition.is_active', true);
    expect($packagingCondition->fresh()->is_active)->toBeTrue();
});

test('activate/deactivate sin packaging_conditions.manage devuelven 403', function () {
    $packagingCondition = PackagingCondition::factory()->create();
    $actor = User::factory()->create();

    $this->actingAs($actor)->postJson("/api/admin/packaging-conditions/{$packagingCondition->id}/activate")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/packaging-conditions/{$packagingCondition->id}/deactivate")->assertForbidden();
});
