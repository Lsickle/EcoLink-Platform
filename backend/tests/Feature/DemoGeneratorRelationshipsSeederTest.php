<?php

use App\Models\GeneratorGestorRelationship;
use App\Models\GeneratorSubgestorRelationship;
use App\Models\Organization;
use Database\Seeders\BranchTypeSeeder;
use Database\Seeders\BusinessRoleSeeder;
use Database\Seeders\CountrySeeder;
use Database\Seeders\DemoGeneratorRelationshipsSeeder;
use Database\Seeders\DemoOrganizationsSeeder;
use Database\Seeders\DemoUsersSeeder;
use Database\Seeders\DepartmentSeeder;
use Database\Seeders\LocalitySeeder;
use Database\Seeders\MunicipalitySeeder;
use Database\Seeders\OrganizationStatusSeeder;
use Database\Seeders\RoleSeeder;
use Database\Seeders\UserStatusSeeder;

// Pedido explícito del usuario, 2026-08-11: sin este seeder, un
// `migrate --seed` en staging deja las 3 organizaciones demo (Immetal/
// EcoTrata/LogVerde) sin ninguna relación Generador-Subgestor/Gestor --
// imposible probar la visibilidad cross-tenant sin crearla a mano desde la
// UI en cada entorno.

beforeEach(function () {
    $this->seed(UserStatusSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->seed(OrganizationStatusSeeder::class);
    $this->seed(BusinessRoleSeeder::class);
    $this->seed(CountrySeeder::class);
    $this->seed(DepartmentSeeder::class);
    $this->seed(MunicipalitySeeder::class);
    $this->seed(LocalitySeeder::class);
    $this->seed(BranchTypeSeeder::class);
    $this->seed(DemoOrganizationsSeeder::class);
    $this->seed(DemoUsersSeeder::class);
});

test('vincula a Immetal (Generador) con LogVerde (Subgestor) y EcoTrata (Gestor), ambas relaciones ACTIVAS', function () {
    $this->seed(DemoGeneratorRelationshipsSeeder::class);

    $immetal = Organization::query()->where('tax_id', '900123456-1')->firstOrFail();
    $ecotrata = Organization::query()->where('tax_id', '900234567-2')->firstOrFail();
    $logverde = Organization::query()->where('tax_id', '900345678-3')->firstOrFail();

    expect(GeneratorSubgestorRelationship::query()
        ->where('generator_organization_id', $immetal->id)
        ->where('subgestor_organization_id', $logverde->id)
        ->where('is_active', true)
        ->exists())->toBeTrue();

    expect(GeneratorGestorRelationship::query()
        ->where('generator_organization_id', $immetal->id)
        ->where('gestor_organization_id', $ecotrata->id)
        ->where('is_active', true)
        ->exists())->toBeTrue();
});

test('es idempotente -- correr el seeder dos veces no duplica las relaciones', function () {
    $this->seed(DemoGeneratorRelationshipsSeeder::class);
    $this->seed(DemoGeneratorRelationshipsSeeder::class);

    expect(GeneratorSubgestorRelationship::query()->count())->toBe(1)
        ->and(GeneratorGestorRelationship::query()->count())->toBe(1);
});
