<?php

use App\Models\Organization;
use App\Models\TransportStatus;
use Database\Seeders\OrganizationStatusSeeder;
use Database\Seeders\PlatformOrganizationSeeder;
use Database\Seeders\TransportStatusSeeder;

// Catálogo BASE "transport_statuses" (D-PRG-08/D-PRG-11) -- 7 filas
// confirmadas en vivo contra Figma, mismo patrón que RespelStatusSeeder.

beforeEach(function () {
    $this->seed(OrganizationStatusSeeder::class);
    $this->seed(PlatformOrganizationSeeder::class);
    $this->seed(TransportStatusSeeder::class);
});

test('siembra exactamente 7 estados bajo la organización PLATAFORMA', function () {
    $platform = Organization::query()->where('tax_id', PlatformOrganizationSeeder::PLATFORM_TAX_ID)->firstOrFail();

    $statuses = TransportStatus::query()->where('tenant_organization_id', $platform->id)->get();

    expect($statuses)->toHaveCount(7)
        ->and($statuses->pluck('code')->sort()->values()->all())
        ->toBe(['BOR', 'CANC', 'CONF', 'EJEC', 'FIN', 'PEND', 'PROG']);
});

test('BOR es el único estado inicial', function () {
    expect(TransportStatus::query()->where('is_initial', true)->pluck('code')->all())->toBe(['BOR']);
});

test('FIN y CANC son los únicos estados finales', function () {
    expect(TransportStatus::query()->where('is_final', true)->pluck('code')->sort()->values()->all())
        ->toBe(['CANC', 'FIN']);
});

test('el seeder es idempotente (correr dos veces no duplica filas)', function () {
    $this->seed(TransportStatusSeeder::class);

    expect(TransportStatus::query()->count())->toBe(7);
});
