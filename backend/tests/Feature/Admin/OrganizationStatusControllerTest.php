<?php

use App\Models\Organization;
use App\Models\OrganizationStatus;
use App\Models\User;

// Catálogo de solo lectura consumido por el CRUD de Organizaciones -- mismo
// gate exclusivo de platform staff que OrganizationController (ver su
// docblock de clase para el criterio).

function platformStaffActorForOrganizationStatuses(): User
{
    $platform = Organization::query()->where('is_platform_tenant', true)->first()
        ?? Organization::factory()->create(['is_platform_tenant' => true]);

    return User::factory()->create(['tenant_organization_id' => $platform->id]);
}

test('index responde 403 para un actor que no es platform staff', function () {
    $tenant = Organization::factory()->create();
    $actor = User::factory()->create(['tenant_organization_id' => $tenant->id]);

    $this->actingAs($actor)->getJson('/api/admin/organization-statuses')->assertForbidden();
});

test('index devuelve los organization_statuses reales ordenados por sort_order, con color_hex', function () {
    // El actor platform staff se crea PRIMERO -- Organization::factory()
    // encadena su propio OrganizationStatus::factory(), así que borrar la
    // tabla después violaría el FK restrict de `organizations.
    // organization_status_id`. Se asignan sort_order muy altos a los dos
    // estados de prueba para que queden al final sin importar qué otras
    // filas ya existan.
    $actor = platformStaffActorForOrganizationStatuses();

    OrganizationStatus::factory()->create(['code' => 'ZZ_B', 'sort_order' => 998, 'color_hex' => '#000000']);
    OrganizationStatus::factory()->create(['code' => 'ZZ_A', 'sort_order' => 997, 'color_hex' => '#ffffff']);

    $response = $this->actingAs($actor)->getJson('/api/admin/organization-statuses')->assertOk();

    $rows = collect($response->json('data'));
    $indexA = $rows->search(fn ($row) => $row['code'] === 'ZZ_A');
    $indexB = $rows->search(fn ($row) => $row['code'] === 'ZZ_B');

    expect($indexA)->not->toBeFalse()
        ->and($indexB)->not->toBeFalse()
        ->and($indexA)->toBeLessThan($indexB)
        ->and($rows[$indexA]['color_hex'])->toBe('#ffffff');
});

test('index filtra por active_only cuando se pide', function () {
    $actor = platformStaffActorForOrganizationStatuses();

    OrganizationStatus::factory()->create(['code' => 'ZZ_ACTIVE', 'is_active' => true]);
    OrganizationStatus::factory()->create(['code' => 'ZZ_INACTIVE', 'is_active' => false]);

    $response = $this->actingAs($actor)->getJson('/api/admin/organization-statuses?active_only=1')->assertOk();

    $codes = collect($response->json('data'))->pluck('code');

    expect($codes)->toContain('ZZ_ACTIVE')->not->toContain('ZZ_INACTIVE');
});
