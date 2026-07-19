<?php

use App\Models\CarteraStatus;
use Database\Seeders\CarteraStatusSeeder;

// Catálogo "cartera_statuses" (D-S04) -- 6 filas confirmadas en vivo contra
// Figma (07-especialista-ux.md §3).

test('siembra exactamente 6 estados', function () {
    $this->seed(CarteraStatusSeeder::class);

    expect(CarteraStatus::query()->count())->toBe(6);
});

test('el seeder es idempotente (correr dos veces no duplica filas)', function () {
    $this->seed(CarteraStatusSeeder::class);
    $this->seed(CarteraStatusSeeder::class);

    expect(CarteraStatus::query()->count())->toBe(6);
});

dataset('estados de cartera esperados', [
    'AL_DIA' => ['AL_DIA', false],
    'POR_VENCER' => ['POR_VENCER', false],
    'VENCIDA' => ['VENCIDA', false],
    'EN_COBRO' => ['EN_COBRO', true],
    'JURIDICO' => ['JURIDICO', true],
    'CASTIGADA' => ['CASTIGADA', true],
]);

test('cada estado tiene el blocks_new_requests exacto confirmado en vivo', function (string $code, bool $blocksNewRequests) {
    $this->seed(CarteraStatusSeeder::class);

    $status = CarteraStatus::query()->where('code', $code)->firstOrFail();

    expect($status->blocks_new_requests)->toBe($blocksNewRequests);
})->with('estados de cartera esperados');
