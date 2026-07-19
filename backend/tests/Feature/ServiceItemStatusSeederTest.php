<?php

use App\Models\ServiceItemStatus;
use Database\Seeders\ServiceItemStatusSeeder;

// Catálogo "service_item_statuses" (D-S10) -- 3 filas: Pendiente/Aceptado/
// Rechazado, citadas textualmente en D-S10.

test('siembra exactamente 3 estados', function () {
    $this->seed(ServiceItemStatusSeeder::class);

    expect(ServiceItemStatus::query()->count())->toBe(3);
});

test('el seeder es idempotente (correr dos veces no duplica filas)', function () {
    $this->seed(ServiceItemStatusSeeder::class);
    $this->seed(ServiceItemStatusSeeder::class);

    expect(ServiceItemStatus::query()->count())->toBe(3);
});

test('siembra los 3 códigos exactos citados en D-S10', function () {
    $this->seed(ServiceItemStatusSeeder::class);

    $codes = ServiceItemStatus::query()->pluck('code')->sort()->values()->all();

    expect($codes)->toBe(['ACCEPTED', 'PENDING', 'REJECTED']);
});

test('todas las filas son del catálogo base (is_system=true, is_active=true)', function () {
    $this->seed(ServiceItemStatusSeeder::class);

    expect(ServiceItemStatus::query()->where('is_system', true)->where('is_active', true)->count())->toBe(3);
});
