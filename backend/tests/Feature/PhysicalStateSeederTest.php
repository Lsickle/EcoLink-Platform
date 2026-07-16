<?php

use App\Models\PhysicalState;
use Database\Seeders\PhysicalStateSeeder;

// Catálogo de 16 Estados Físicos (Batch 2/3 de Catálogos Maestros, RESPEL).

beforeEach(function () {
    $this->seed(PhysicalStateSeeder::class);
});

test('siembra exactamente 16 physical_states', function () {
    expect(PhysicalState::query()->count())->toBe(16);
});

dataset('physical_states esperados', [
    'SOLIDO' => ['SOLIDO', 'Sólido'],
    'LIQUIDO' => ['LIQUIDO', 'Líquido'],
    'GASEOSO' => ['GASEOSO', 'Gaseoso'],
    'SEMISOLIDO' => ['SEMISOLIDO', 'Semisólido'],
    'LODO' => ['LODO', 'Lodo'],
    'PASTA' => ['PASTA', 'Pasta'],
    'GEL' => ['GEL', 'Gel'],
    'AEROSOL' => ['AEROSOL', 'Aerosol'],
    'MEZCLA_SOLIDO_LIQUIDO' => ['MEZCLA_SOLIDO_LIQUIDO', 'Mezcla sólido-líquido'],
    'MEZCLA_LIQUIDO_LODO' => ['MEZCLA_LIQUIDO_LODO', 'Mezcla líquido-lodo'],
    'POLVO' => ['POLVO', 'Polvo'],
    'GRANULADO' => ['GRANULADO', 'Granulado'],
    'CENIZA' => ['CENIZA', 'Ceniza'],
    'EMULSION' => ['EMULSION', 'Emulsión'],
    'SUSPENSION' => ['SUSPENSION', 'Suspensión'],
    'NO_DETERMINADO' => ['NO_DETERMINADO', 'No determinado'],
]);

test('cada physical_state tiene el code/name exactos', function (string $code, string $name) {
    $physicalState = PhysicalState::query()->where('code', $code)->firstOrFail();

    expect($physicalState->name)->toBe($name)
        ->and($physicalState->is_system)->toBeTrue()
        ->and($physicalState->is_active)->toBeTrue();
})->with('physical_states esperados');

test('el seeder es idempotente (correr dos veces no duplica filas)', function () {
    $this->seed(PhysicalStateSeeder::class);

    expect(PhysicalState::query()->count())->toBe(16);
});
