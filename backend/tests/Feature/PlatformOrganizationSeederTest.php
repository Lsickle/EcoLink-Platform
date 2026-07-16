<?php

use App\Models\Organization;
use Database\Seeders\OrganizationStatusSeeder;
use Database\Seeders\PlatformOrganizationSeeder;

// Hallazgo Alto (especialista-seguridad, 2026-07-14): el gate de plataforma
// de InvitationRequestController (User::isPlatformStaff()) exige que exista
// exactamente una fila is_platform_tenant=true (D-CER-04) -- sin esta
// siembra, el gate sería insatisfacible.

beforeEach(function () {
    $this->seed(OrganizationStatusSeeder::class);
});

test('siembra exactamente 1 organización con is_platform_tenant=true', function () {
    $this->seed(PlatformOrganizationSeeder::class);

    expect(Organization::query()->where('is_platform_tenant', true)->count())->toBe(1);

    $platform = Organization::query()->where('is_platform_tenant', true)->firstOrFail();
    expect($platform->tax_id)->toBe(PlatformOrganizationSeeder::PLATFORM_TAX_ID)
        ->and($platform->status->code)->toBe('ACT')
        ->and($platform->is_active)->toBeTrue();
});

test('el seeder es idempotente (correr dos veces no duplica la fila)', function () {
    $this->seed(PlatformOrganizationSeeder::class);
    $this->seed(PlatformOrganizationSeeder::class);

    expect(Organization::query()->where('is_platform_tenant', true)->count())->toBe(1);
});
