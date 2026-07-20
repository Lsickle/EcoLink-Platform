<?php

use App\Models\ManifestStatus;
use App\Models\Organization;
use Database\Seeders\ManifestStatusSeeder;
use Database\Seeders\OrganizationStatusSeeder;
use Database\Seeders\PlatformOrganizationSeeder;

// Catálogo BASE "manifest_statuses" (D-MAN-01) -- 8 filas confirmadas
// (issue MAN-17), mismo patrón que TransportStatusSeeder/RespelStatusSeeder.

beforeEach(function () {
    $this->seed(OrganizationStatusSeeder::class);
    $this->seed(PlatformOrganizationSeeder::class);
    $this->seed(ManifestStatusSeeder::class);
});

test('siembra exactamente 8 estados bajo la organización PLATAFORMA', function () {
    $platform = Organization::query()->where('tax_id', PlatformOrganizationSeeder::PLATFORM_TAX_ID)->firstOrFail();

    $statuses = ManifestStatus::query()->where('tenant_organization_id', $platform->id)->get();

    expect($statuses)->toHaveCount(8)
        ->and($statuses->pluck('code')->sort()->values()->all())
        ->toBe(['CANCELLED', 'CLOSED', 'DRAFT', 'GENERATED', 'IN_TRANSIT', 'PARTIALLY_SIGNED', 'RECEIVED', 'SIGNED']);
});

test('DRAFT es el único estado inicial', function () {
    expect(ManifestStatus::query()->where('is_initial', true)->pluck('code')->all())->toBe(['DRAFT']);
});

test('CLOSED y CANCELLED son los únicos estados finales', function () {
    expect(ManifestStatus::query()->where('is_final', true)->pluck('code')->sort()->values()->all())
        ->toBe(['CANCELLED', 'CLOSED']);
});

test('el seeder es idempotente (correr dos veces no duplica filas)', function () {
    $this->seed(ManifestStatusSeeder::class);

    expect(ManifestStatus::query()->count())->toBe(8);
});
