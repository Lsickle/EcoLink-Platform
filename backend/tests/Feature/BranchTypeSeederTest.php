<?php

use App\Models\BranchType;
use Database\Seeders\BranchTypeSeeder;

// Catálogo de 8 branch_types (Tipos de Sede). Ver AVISO en
// BranchTypeSeeder sobre la interpretación de los flags de capacidad.

beforeEach(function () {
    $this->seed(BranchTypeSeeder::class);
});

test('siembra exactamente 8 branch_types', function () {
    expect(BranchType::query()->count())->toBe(8);
});

dataset('branch_types esperados', [
    'ADM' => ['ADM', 'Administrativa', 'Administrativa', false, false, false, false],
    'OPR' => ['OPR', 'Operativa', 'Operativa', false, false, false, false],
    'PLT' => ['PLT', 'Planta', 'Productiva', false, false, true, false],
    'ACO' => ['ACO', 'Centro de Acopio', 'Logística', true, true, false, false],
    'LAB' => ['LAB', 'Laboratorio', 'Técnica', false, false, false, false],
    'TRB' => ['TRB', 'Transbordo', 'Logística', true, false, false, true],
    'COM' => ['COM', 'Comercialización', 'Mixta', false, true, false, true],
    'TMP' => ['TMP', 'Temporal', 'Mixta', false, true, false, false],
]);

test('cada branch_type tiene el code/name/category/flags exactos', function (
    string $code,
    string $name,
    string $category,
    bool $isLogistics,
    bool $isStorage,
    bool $isTreatment,
    bool $isDispatch,
) {
    $branchType = BranchType::query()->where('code', $code)->firstOrFail();

    expect($branchType->name)->toBe($name)
        ->and($branchType->category)->toBe($category)
        ->and($branchType->is_logistics)->toBe($isLogistics)
        ->and($branchType->is_storage)->toBe($isStorage)
        ->and($branchType->is_treatment)->toBe($isTreatment)
        ->and($branchType->is_dispatch)->toBe($isDispatch)
        ->and($branchType->is_active)->toBeTrue();
})->with('branch_types esperados');

test('el seeder es idempotente (correr dos veces no duplica filas)', function () {
    $this->seed(BranchTypeSeeder::class);

    expect(BranchType::query()->count())->toBe(8);
});
