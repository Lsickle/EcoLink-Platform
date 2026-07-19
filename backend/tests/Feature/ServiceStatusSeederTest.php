<?php

use App\Models\ServiceStatus;
use Database\Seeders\ServiceStatusSeeder;

// Catálogo BASE "service_statuses" (D-S02) -- 9 filas, organization_id=NULL.

test('siembra exactamente 9 estados globales', function () {
    $this->seed(ServiceStatusSeeder::class);

    expect(ServiceStatus::query()->whereNull('organization_id')->count())->toBe(9);
});

test('el seeder es idempotente (correr dos veces no duplica filas)', function () {
    $this->seed(ServiceStatusSeeder::class);
    $this->seed(ServiceStatusSeeder::class);

    expect(ServiceStatus::query()->count())->toBe(9);
});

dataset('estados esperados', [
    'DRAFT' => ['DRAFT', 1, true, false, false],
    'SUBMITTED' => ['SUBMITTED', 2, false, false, true],
    'UNDER_REVIEW' => ['UNDER_REVIEW', 3, false, false, true],
    'APPROVED' => ['APPROVED', 4, false, false, true],
    'REJECTED' => ['REJECTED', 5, false, true, true],
    'SCHEDULED' => ['SCHEDULED', 6, false, false, true],
    'IN_EXECUTION' => ['IN_EXECUTION', 7, false, false, true],
    'COMPLETED' => ['COMPLETED', 8, false, true, true],
    'CANCELLED' => ['CANCELLED', 9, false, true, true],
]);

test('cada estado tiene la semántica exacta de D-S02/D-S17', function (
    string $code, int $sequenceOrder, bool $isInitial, bool $isTerminal, bool $blocksEditing,
) {
    $this->seed(ServiceStatusSeeder::class);

    $status = ServiceStatus::query()->whereNull('organization_id')->where('code', $code)->firstOrFail();

    expect($status->sequence_order)->toBe($sequenceOrder)
        ->and($status->is_initial_status)->toBe($isInitial)
        ->and($status->is_terminal_status)->toBe($isTerminal)
        ->and($status->blocks_editing)->toBe($blocksEditing)
        ->and($status->is_system_status)->toBeTrue()
        ->and($status->is_active)->toBeTrue();
})->with('estados esperados');

test('solo DRAFT permite edición libre (blocks_editing=false)', function () {
    $this->seed(ServiceStatusSeeder::class);

    $unblocked = ServiceStatus::query()->whereNull('organization_id')->where('blocks_editing', false)->pluck('code');

    expect($unblocked->all())->toBe(['DRAFT']);
});
