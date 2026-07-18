<?php

use App\Models\Organization;
use App\Models\OrganizationalArea;
use Database\Seeders\BranchTypeSeeder;
use Database\Seeders\BusinessRoleSeeder;
use Database\Seeders\CountrySeeder;
use Database\Seeders\DemoOrganizationsSeeder;
use Database\Seeders\DepartmentSeeder;
use Database\Seeders\LocalitySeeder;
use Database\Seeders\MunicipalitySeeder;
use Database\Seeders\OrganizationalAreaSeeder;
use Database\Seeders\OrganizationStatusSeeder;

// Datos de demostración del Catálogo Maestro "Áreas Organizacionales" --
// siembra una jerarquía simple (1 raíz + 3 hijas) por cada una de las 3
// organizaciones demo (Immetal/GENERATOR, EcoTrata/GESTOR,
// LogVerde/SUBGESTOR) ya sembradas por DemoOrganizationsSeeder.

beforeEach(function () {
    $this->seed(OrganizationStatusSeeder::class);
    $this->seed(BusinessRoleSeeder::class);
    $this->seed(CountrySeeder::class);
    $this->seed(DepartmentSeeder::class);
    $this->seed(MunicipalitySeeder::class);
    $this->seed(LocalitySeeder::class);
    $this->seed(BranchTypeSeeder::class);
    $this->seed(DemoOrganizationsSeeder::class);
    $this->seed(OrganizationalAreaSeeder::class);
});

dataset('organizaciones demo', [
    'Immetal (GENERATOR)' => ['900123456-1'],
    'EcoTrata (GESTOR)' => ['900234567-2'],
    'LogVerde (SUBGESTOR)' => ['900345678-3'],
]);

test('siembra 4 áreas (1 raíz + 3 hijas) por cada organización demo', function (string $taxId) {
    $organization = Organization::query()->where('tax_id', $taxId)->firstOrFail();

    $areas = OrganizationalArea::query()->where('organization_id', $organization->id)->get();

    expect($areas)->toHaveCount(4);
})->with('organizaciones demo');

test('cada organización tiene exactamente un área raíz (sin parent_area_id) de nivel Dirección', function (string $taxId) {
    $organization = Organization::query()->where('tax_id', $taxId)->firstOrFail();

    $roots = OrganizationalArea::query()
        ->where('organization_id', $organization->id)
        ->whereNull('parent_area_id')
        ->get();

    expect($roots)->toHaveCount(1)
        ->and($roots->first()->level)->toBe('Dirección');
})->with('organizaciones demo');

test('las áreas hijas apuntan a un parent_area_id de la MISMA organización', function (string $taxId) {
    $organization = Organization::query()->where('tax_id', $taxId)->firstOrFail();

    $children = OrganizationalArea::query()
        ->where('organization_id', $organization->id)
        ->whereNotNull('parent_area_id')
        ->get();

    expect($children)->toHaveCount(3);

    foreach ($children as $child) {
        expect($child->parent->organization_id)->toBe($organization->id);
    }
})->with('organizaciones demo');

test('los code de las áreas son únicos dentro de cada organización', function (string $taxId) {
    $organization = Organization::query()->where('tax_id', $taxId)->firstOrFail();

    $codes = OrganizationalArea::query()->where('organization_id', $organization->id)->pluck('code');

    expect($codes->unique())->toHaveCount($codes->count());
})->with('organizaciones demo');

test('el seeder es idempotente (correr dos veces no duplica áreas)', function () {
    $countBefore = OrganizationalArea::query()->count();

    $this->seed(OrganizationalAreaSeeder::class);

    expect(OrganizationalArea::query()->count())->toBe($countBefore);
});

test('si una organización demo no existe, el seeder la omite sin fallar', function () {
    Organization::query()->where('tax_id', '900123456-1')->delete();

    $this->seed(OrganizationalAreaSeeder::class);
})->throwsNoExceptions();
