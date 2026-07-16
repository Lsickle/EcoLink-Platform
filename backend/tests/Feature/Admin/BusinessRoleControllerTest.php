<?php

use App\Models\BusinessRole;
use App\Models\Organization;
use App\Models\User;

// Catálogo de solo lectura consumido por el CRUD de Organizaciones -- mismo
// gate exclusivo de platform staff que OrganizationController (ver su
// docblock de clase para el criterio).

function platformStaffActorForBusinessRoles(): User
{
    $platform = Organization::query()->where('is_platform_tenant', true)->first()
        ?? Organization::factory()->create(['is_platform_tenant' => true]);

    return User::factory()->create(['tenant_organization_id' => $platform->id]);
}

test('index responde 403 para un actor que no es platform staff', function () {
    $tenant = Organization::factory()->create();
    $actor = User::factory()->create(['tenant_organization_id' => $tenant->id]);

    $this->actingAs($actor)->getJson('/api/admin/business-roles')->assertForbidden();
});

test('index devuelve los business_roles reales ordenados por sort_order', function () {
    BusinessRole::query()->delete();
    $roleB = BusinessRole::factory()->create(['code' => 'B', 'sort_order' => 2]);
    $roleA = BusinessRole::factory()->create(['code' => 'A', 'sort_order' => 1]);

    $actor = platformStaffActorForBusinessRoles();

    $response = $this->actingAs($actor)->getJson('/api/admin/business-roles')->assertOk();

    expect($response->json('data.0.code'))->toBe('A')
        ->and($response->json('data.1.code'))->toBe('B');
});

test('index filtra por active_only cuando se pide', function () {
    BusinessRole::query()->delete();
    BusinessRole::factory()->create(['code' => 'ACTIVE', 'is_active' => true]);
    BusinessRole::factory()->create(['code' => 'INACTIVE', 'is_active' => false]);

    $actor = platformStaffActorForBusinessRoles();

    $response = $this->actingAs($actor)->getJson('/api/admin/business-roles?active_only=1')->assertOk();

    $codes = collect($response->json('data'))->pluck('code');

    expect($codes)->toContain('ACTIVE')->not->toContain('INACTIVE');
});
