<?php

use App\Models\VehicleType;
use Database\Seeders\VehicleTypeSeeder;

// Catálogo de 4 Tipos de Vehículo (Batch 3/3, último de Catálogos
// Maestros) -- PROVISIONAL, ver AVISO en VehicleTypeSeeder (sin fuente de
// negocio confirmada, valores del mock Figma 881:11199). Tabla de
// referencia aislada -- no toca `vehicles.vehicle_type`.

beforeEach(function () {
    $this->seed(VehicleTypeSeeder::class);
});

test('siembra exactamente 4 vehicle_types', function () {
    expect(VehicleType::query()->count())->toBe(4);
});

dataset('vehicle_types esperados', [
    'CAM' => ['CAM', 'Camión'],
    'TRACTO' => ['TRACTO', 'Tractocamión'],
    'FURGON' => ['FURGON', 'Furgón'],
    'CISTERNA' => ['CISTERNA', 'Cisterna'],
]);

test('cada vehicle_type tiene el code/name exactos y category nula', function (string $code, string $name) {
    $vehicleType = VehicleType::query()->where('code', $code)->firstOrFail();

    expect($vehicleType->name)->toBe($name)
        ->and($vehicleType->category)->toBeNull()
        ->and($vehicleType->is_system)->toBeTrue()
        ->and($vehicleType->is_active)->toBeTrue();
})->with('vehicle_types esperados');

test('el seeder es idempotente (correr dos veces no duplica filas)', function () {
    $this->seed(VehicleTypeSeeder::class);

    expect(VehicleType::query()->count())->toBe(4);
});
