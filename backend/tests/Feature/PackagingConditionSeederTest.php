<?php

use App\Models\PackagingCondition;
use Database\Seeders\PackagingConditionSeeder;

// Catálogo de 3 Estados del Embalaje (Batch 3/3, último de Catálogos
// Maestros) -- PROVISIONAL, ver AVISO en PackagingConditionSeeder (sin
// fuente de negocio confirmada, valores del mock Figma 877:10997).

beforeEach(function () {
    $this->seed(PackagingConditionSeeder::class);
});

test('siembra exactamente 3 packaging_conditions', function () {
    expect(PackagingCondition::query()->count())->toBe(3);
});

dataset('packaging_conditions esperadas', [
    'BUENO' => ['BUENO', 'Bueno', 1],
    'REGULAR' => ['REGULAR', 'Regular', 5],
    'DETERIORADO' => ['DETERIORADO', 'Deteriorado', 9],
]);

test('cada packaging_condition tiene el code/name/risk_level exactos', function (
    string $code,
    string $name,
    int $riskLevel,
) {
    $packagingCondition = PackagingCondition::query()->where('code', $code)->firstOrFail();

    expect($packagingCondition->name)->toBe($name)
        ->and($packagingCondition->risk_level)->toBe($riskLevel)
        ->and($packagingCondition->is_system)->toBeTrue()
        ->and($packagingCondition->is_active)->toBeTrue();
})->with('packaging_conditions esperadas');

test('el seeder es idempotente (correr dos veces no duplica filas)', function () {
    $this->seed(PackagingConditionSeeder::class);

    expect(PackagingCondition::query()->count())->toBe(3);
});
