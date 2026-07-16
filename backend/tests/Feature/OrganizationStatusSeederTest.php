<?php

use App\Models\OrganizationStatus;
use Database\Seeders\OrganizationStatusSeeder;

// Catálogo de 5 organization_statuses (seed real, no interpretado).

beforeEach(function () {
    $this->seed(OrganizationStatusSeeder::class);
});

test('siembra exactamente 5 organization_statuses', function () {
    expect(OrganizationStatus::query()->count())->toBe(5);
});

dataset('organization_statuses esperados', [
    'PRO' => ['PRO', 'PROSPECTO', true, false, false, false, '#3d75dc', 1],
    'ACT' => ['ACT', 'ACTIVA', false, false, true, false, '#228b33', 2],
    'SUS' => ['SUS', 'SUSPENDIDA', false, false, false, true, '#c57d10', 3],
    'INA' => ['INA', 'INACTIVA', false, true, false, false, '#737373', 4],
    'BLO' => ['BLO', 'BLOQUEADA', false, false, false, true, '#cc0c0c', 5],
]);

test('cada organization_status tiene el name/flags/color/sort_order exactos', function (
    string $code,
    string $name,
    bool $isInitial,
    bool $isFinal,
    bool $allowsOperation,
    bool $isSuspended,
    string $colorHex,
    int $sortOrder,
) {
    $organizationStatus = OrganizationStatus::query()->where('code', $code)->firstOrFail();

    expect($organizationStatus->name)->toBe($name)
        ->and($organizationStatus->is_initial)->toBe($isInitial)
        ->and($organizationStatus->is_final)->toBe($isFinal)
        ->and($organizationStatus->allows_operation)->toBe($allowsOperation)
        ->and($organizationStatus->is_suspended)->toBe($isSuspended)
        ->and($organizationStatus->color_hex)->toBe($colorHex)
        ->and($organizationStatus->sort_order)->toBe($sortOrder)
        ->and($organizationStatus->requires_document_validation)->toBeFalse()
        ->and($organizationStatus->requires_commercial_approval)->toBeFalse()
        ->and($organizationStatus->is_active)->toBeTrue();
})->with('organization_statuses esperados');

test('el seeder es idempotente (correr dos veces no duplica filas)', function () {
    $this->seed(OrganizationStatusSeeder::class);

    expect(OrganizationStatus::query()->count())->toBe(5);
});
