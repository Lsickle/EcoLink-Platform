<?php

use App\Models\WasteCategory;
use Database\Seeders\WasteCategorySeeder;

// Catálogo de 8 Categorías de Residuo (Batch 2/3 de Catálogos Maestros,
// RESPEL, D-R05).

beforeEach(function () {
    $this->seed(WasteCategorySeeder::class);
});

test('siembra exactamente 8 waste_categories', function () {
    expect(WasteCategory::query()->count())->toBe(8);
});

dataset('waste_categories esperadas', [
    'INDUSTRIAL' => ['INDUSTRIAL', 'INDUSTRIAL'],
    'HOSPITALARIO_Y_SIMILARES' => ['HOSPITALARIO_Y_SIMILARES', 'HOSPITALARIO Y SIMILARES'],
    'APROVECHABLE' => ['APROVECHABLE', 'APROVECHABLE'],
    'ORGANICO' => ['ORGANICO', 'ORGÁNICO'],
    'POSCONSUMO' => ['POSCONSUMO', 'POSCONSUMO'],
    'RCD' => ['RCD', 'RCD'],
    'ESPECIAL' => ['ESPECIAL', 'ESPECIAL'],
    'ORDINARIO' => ['ORDINARIO', 'ORDINARIO'],
]);

test('cada waste_category tiene el code/name exactos y description no vacía', function (string $code, string $name) {
    $wasteCategory = WasteCategory::query()->where('code', $code)->firstOrFail();

    expect($wasteCategory->name)->toBe($name)
        ->and($wasteCategory->description)->not->toBeEmpty()
        ->and($wasteCategory->is_system)->toBeTrue()
        ->and($wasteCategory->is_active)->toBeTrue();
})->with('waste_categories esperadas');

test('el seeder es idempotente (correr dos veces no duplica filas)', function () {
    $this->seed(WasteCategorySeeder::class);

    expect(WasteCategory::query()->count())->toBe(8);
});
