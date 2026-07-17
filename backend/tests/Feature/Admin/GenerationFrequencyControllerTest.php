<?php

use App\Models\GenerationFrequency;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\UserRole;

// Catálogo Maestro "Frecuencia de Generación" (Módulo Residuos, núcleo) --
// gateado por GenerationFrequencyPolicy -> User::hasPermission()
// ('generation_frequencies.read'/'generation_frequencies.manage'). CRUD
// completo, catálogo 100% global -- mismo patrón exacto que
// PhysicalStateController.

function actorWithGenerationFrequencyPermission(array $codes): User
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

test('index respeta generation_frequencies.read', function () {
    GenerationFrequency::factory()->create();

    $noPermission = User::factory()->create();
    $this->actingAs($noPermission)->getJson('/api/admin/generation-frequencies')->assertForbidden();

    $reader = actorWithGenerationFrequencyPermission(['generation_frequencies.read']);
    $this->actingAs($reader)->getJson('/api/admin/generation-frequencies')->assertOk();
});

test('store crea una frecuencia de generación nueva (generation_frequencies.manage)', function () {
    $actor = actorWithGenerationFrequencyPermission(['generation_frequencies.manage']);

    $response = $this->actingAs($actor)->postJson('/api/admin/generation-frequencies', [
        'code' => 'NEW',
        'name' => 'Frecuencia Nueva',
    ]);

    $response->assertCreated()->assertJsonPath('generation_frequency.code', 'NEW');
});

test('store sin generation_frequencies.manage devuelve 403', function () {
    $actor = User::factory()->create();

    $this->actingAs($actor)->postJson('/api/admin/generation-frequencies', [
        'code' => 'X', 'name' => 'X',
    ])->assertForbidden();
});

test('store rechaza code duplicado', function () {
    GenerationFrequency::factory()->create(['code' => 'DUP']);
    $actor = actorWithGenerationFrequencyPermission(['generation_frequencies.manage']);

    $this->actingAs($actor)->postJson('/api/admin/generation-frequencies', [
        'code' => 'DUP', 'name' => 'Otro nombre',
    ])->assertUnprocessable()->assertJsonValidationErrors('code');
});

test('update edita una frecuencia de generación (generation_frequencies.manage)', function () {
    $generationFrequency = GenerationFrequency::factory()->create();
    $actor = actorWithGenerationFrequencyPermission(['generation_frequencies.manage']);

    $this->actingAs($actor)->putJson("/api/admin/generation-frequencies/{$generationFrequency->id}", ['name' => 'Nombre editado'])
        ->assertOk()
        ->assertJsonPath('generation_frequency.name', 'Nombre editado');
});

test('activate/deactivate respetan generation_frequencies.manage y cambian is_active', function () {
    $generationFrequency = GenerationFrequency::factory()->create(['is_active' => true]);
    $actor = actorWithGenerationFrequencyPermission(['generation_frequencies.manage']);

    $this->actingAs($actor)->postJson("/api/admin/generation-frequencies/{$generationFrequency->id}/deactivate")
        ->assertOk()
        ->assertJsonPath('generation_frequency.is_active', false);

    $this->actingAs($actor)->postJson("/api/admin/generation-frequencies/{$generationFrequency->id}/activate")
        ->assertOk()
        ->assertJsonPath('generation_frequency.is_active', true);
});

test('seed real de 4 valores confirmados', function () {
    $this->seed(\Database\Seeders\GenerationFrequencySeeder::class);

    $codes = GenerationFrequency::query()->pluck('code')->sort()->values()->all();
    expect($codes)->toBe(['DAILY', 'MONTHLY', 'OCCASIONAL', 'WEEKLY']);
});
