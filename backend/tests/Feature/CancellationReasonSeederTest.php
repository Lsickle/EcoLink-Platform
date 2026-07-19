<?php

use App\Models\CancellationReason;
use Database\Seeders\CancellationReasonSeeder;

// Catálogo "cancellation_reasons" (D-S09) -- solo la fila OTHER tiene seed
// confirmado; el resto del catálogo queda pendiente (issue S-36, no
// bloqueante), no se inventa.

test('siembra exactamente 1 fila (OTHER)', function () {
    $this->seed(CancellationReasonSeeder::class);

    expect(CancellationReason::query()->count())->toBe(1);
});

test('el seeder es idempotente (correr dos veces no duplica filas)', function () {
    $this->seed(CancellationReasonSeeder::class);
    $this->seed(CancellationReasonSeeder::class);

    expect(CancellationReason::query()->count())->toBe(1);
});

test('la fila OTHER es global, marcada is_other=true', function () {
    $this->seed(CancellationReasonSeeder::class);

    $other = CancellationReason::query()->where('code', 'OTHER')->firstOrFail();

    expect($other->organization_id)->toBeNull()
        ->and($other->is_other)->toBeTrue()
        ->and($other->is_system)->toBeTrue()
        ->and($other->is_active)->toBeTrue();
});
