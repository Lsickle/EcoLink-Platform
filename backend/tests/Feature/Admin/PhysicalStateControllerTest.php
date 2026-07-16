<?php

use App\Models\Permission;
use App\Models\PhysicalState;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\UserRole;

// Catálogo Maestro "Estado Físico" (Batch 2/3) -- gateado por
// PhysicalStatePolicy -> User::hasPermission()
// ('physical_states.read'/'physical_states.manage'). CRUD completo,
// catálogo 100% global (sin tenant_organization_id).

function actorWithPhysicalStatePermission(array $codes): User
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

test('index respeta physical_states.read', function () {
    PhysicalState::factory()->create();

    $noPermission = User::factory()->create();
    $this->actingAs($noPermission)->getJson('/api/admin/physical-states')->assertForbidden();

    $reader = actorWithPhysicalStatePermission(['physical_states.read']);
    $this->actingAs($reader)->getJson('/api/admin/physical-states')->assertOk();
});

test('index filtra por search en code/name', function () {
    PhysicalState::factory()->create(['code' => 'SOLIDO', 'name' => 'Sólido']);
    PhysicalState::factory()->create(['code' => 'LIQUIDO', 'name' => 'Líquido']);
    $actor = actorWithPhysicalStatePermission(['physical_states.read']);

    $response = $this->actingAs($actor)->getJson('/api/admin/physical-states?search=Sólido')->assertOk();

    $codes = collect($response->json('data'))->pluck('code');
    expect($codes)->toContain('SOLIDO')->not->toContain('LIQUIDO');
});

test('index filtra por status active/inactive', function () {
    PhysicalState::factory()->create(['code' => 'AA', 'is_active' => true]);
    PhysicalState::factory()->create(['code' => 'BB', 'is_active' => false]);
    $actor = actorWithPhysicalStatePermission(['physical_states.read']);

    $active = collect($this->actingAs($actor)->getJson('/api/admin/physical-states?status=active')->assertOk()->json('data'))->pluck('code');
    expect($active)->toContain('AA')->not->toContain('BB');
});

test('store crea un estado físico nuevo (physical_states.manage)', function () {
    $actor = actorWithPhysicalStatePermission(['physical_states.manage']);

    $response = $this->actingAs($actor)->postJson('/api/admin/physical-states', [
        'code' => 'NEW',
        'name' => 'Estado Nuevo',
    ]);

    $response->assertCreated()->assertJsonPath('physical_state.code', 'NEW');

    $physicalState = PhysicalState::query()->where('code', 'NEW')->firstOrFail();
    expect($physicalState->is_active)->toBeTrue()
        ->and($physicalState->is_system)->toBeFalse();
});

test('store sin physical_states.manage devuelve 403', function () {
    $actor = User::factory()->create();

    $this->actingAs($actor)->postJson('/api/admin/physical-states', [
        'code' => 'X', 'name' => 'X',
    ])->assertForbidden();
});

test('store rechaza code duplicado', function () {
    PhysicalState::factory()->create(['code' => 'DUP']);
    $actor = actorWithPhysicalStatePermission(['physical_states.manage']);

    $this->actingAs($actor)->postJson('/api/admin/physical-states', [
        'code' => 'DUP', 'name' => 'Otro nombre',
    ])->assertUnprocessable()->assertJsonValidationErrors('code');
});

test('update edita un estado físico (physical_states.manage)', function () {
    $physicalState = PhysicalState::factory()->create();
    $actor = actorWithPhysicalStatePermission(['physical_states.manage']);

    $this->actingAs($actor)->putJson("/api/admin/physical-states/{$physicalState->id}", ['name' => 'Nombre editado'])
        ->assertOk()
        ->assertJsonPath('physical_state.name', 'Nombre editado');
});

test('update sin physical_states.manage devuelve 403', function () {
    $physicalState = PhysicalState::factory()->create();
    $actor = User::factory()->create();

    $this->actingAs($actor)->putJson("/api/admin/physical-states/{$physicalState->id}", ['name' => 'X'])->assertForbidden();
});

test('activate/deactivate respetan physical_states.manage y cambian is_active', function () {
    $physicalState = PhysicalState::factory()->create(['is_active' => true]);
    $actor = actorWithPhysicalStatePermission(['physical_states.manage']);

    $this->actingAs($actor)->postJson("/api/admin/physical-states/{$physicalState->id}/deactivate")
        ->assertOk()
        ->assertJsonPath('physical_state.is_active', false);
    expect($physicalState->fresh()->is_active)->toBeFalse();

    $this->actingAs($actor)->postJson("/api/admin/physical-states/{$physicalState->id}/activate")
        ->assertOk()
        ->assertJsonPath('physical_state.is_active', true);
    expect($physicalState->fresh()->is_active)->toBeTrue();
});

test('activate/deactivate sin physical_states.manage devuelven 403', function () {
    $physicalState = PhysicalState::factory()->create();
    $actor = User::factory()->create();

    $this->actingAs($actor)->postJson("/api/admin/physical-states/{$physicalState->id}/activate")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/physical-states/{$physicalState->id}/deactivate")->assertForbidden();
});
