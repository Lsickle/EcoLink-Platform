<?php

use App\Models\HazardCharacteristic;
use Database\Seeders\HazardCharacteristicSeeder;

// Catálogo de 9 Características de Peligrosidad (Batch 2/3 de Catálogos
// Maestros, RESPEL). Ver AVISO en HazardCharacteristicSeeder sobre el
// esquema de `code` (sin fuente confirmada de códigos cortos).

beforeEach(function () {
    $this->seed(HazardCharacteristicSeeder::class);
});

test('siembra exactamente 9 hazard_characteristics', function () {
    expect(HazardCharacteristic::query()->count())->toBe(9);
});

dataset('hazard_characteristics esperadas', [
    'RADIOACTIVO' => ['RAD', 'RADIOACTIVO', 9],
    'EXPLOSIVO' => ['EXP', 'EXPLOSIVO', 9],
    'TOXICO' => ['TOX', 'TOXICO', 7],
    'INFECCIOSO' => ['INFEC', 'INFECCIOSO', 7],
    'CORROSIVO' => ['COR', 'CORROSIVO', 5],
    'REACTIVO' => ['REA', 'REACTIVO', 5],
    'INFLAMABLE' => ['INF', 'INFLAMABLE', 3],
    'ECOTOXICO' => ['ECO', 'ECOTOXICO', 3],
    'IRRITANTE' => ['IRR', 'IRRITANTE', 1],
]);

test('cada hazard_characteristic tiene el code/name/risk_level exactos', function (
    string $code,
    string $name,
    int $riskLevel,
) {
    $hazardCharacteristic = HazardCharacteristic::query()->where('code', $code)->firstOrFail();

    expect($hazardCharacteristic->name)->toBe($name)
        ->and($hazardCharacteristic->risk_level)->toBe($riskLevel)
        ->and($hazardCharacteristic->is_system)->toBeTrue()
        ->and($hazardCharacteristic->is_active)->toBeTrue();
})->with('hazard_characteristics esperadas');

test('el seeder es idempotente (correr dos veces no duplica filas)', function () {
    $this->seed(HazardCharacteristicSeeder::class);

    expect(HazardCharacteristic::query()->count())->toBe(9);
});
