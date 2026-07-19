<?php

use App\Models\Organization;
use App\Models\RespelStatus;
use Database\Seeders\OrganizationStatusSeeder;
use Database\Seeders\PlatformOrganizationSeeder;
use Database\Seeders\RespelStatusSeeder;

// Catálogo BASE "respel_statuses" (motor de Workflow, D-WF-02) -- 11 filas:
// 5 técnicas + 6 comerciales, semántica idéntica a la ya hardcodeada en
// WasteTreatmentApprovalController (ver docblock de RespelStatusSeeder).

beforeEach(function () {
    $this->seed(OrganizationStatusSeeder::class);
    $this->seed(PlatformOrganizationSeeder::class);
    $this->seed(RespelStatusSeeder::class);
});

test('siembra exactamente 11 estados', function () {
    expect(RespelStatus::query()->count())->toBe(11);
});

test('el seeder es idempotente (correr dos veces no duplica filas)', function () {
    $this->seed(RespelStatusSeeder::class);

    expect(RespelStatus::query()->count())->toBe(11);
});

test('todas las filas pertenecen a la organización PLATAFORMA', function () {
    $platform = Organization::query()->where('tax_id', PlatformOrganizationSeeder::PLATFORM_TAX_ID)->firstOrFail();

    expect(RespelStatus::query()->where('tenant_organization_id', $platform->id)->count())->toBe(11);
});

dataset('estados técnicos esperados', [
    'TECH_PENDING' => ['TECH_PENDING', true, false, false, false],
    'TECH_UNDER_REVIEW' => ['TECH_UNDER_REVIEW', false, false, false, false],
    'TECH_APPROVED' => ['TECH_APPROVED', false, true, true, false],
    'TECH_RESTRICTED' => ['TECH_RESTRICTED', false, true, true, false],
    'TECH_REJECTED' => ['TECH_REJECTED', false, true, false, true],
]);

test('cada estado técnico tiene la semántica exacta del controller', function (
    string $code, bool $isInitial, bool $isFinal, bool $isApproved, bool $isRejected,
) {
    $status = RespelStatus::query()->where('code', $code)->firstOrFail();

    expect($status->is_initial)->toBe($isInitial)
        ->and($status->is_final)->toBe($isFinal)
        ->and($status->is_approved_status)->toBe($isApproved)
        ->and($status->is_rejected_status)->toBe($isRejected);
})->with('estados técnicos esperados');

test('TECH_RESTRICTED requiere información adicional, a diferencia de TECH_APPROVED', function () {
    $approved = RespelStatus::query()->where('code', 'TECH_APPROVED')->firstOrFail();
    $restricted = RespelStatus::query()->where('code', 'TECH_RESTRICTED')->firstOrFail();

    expect($approved->requires_additional_information)->toBeFalse()
        ->and($restricted->requires_additional_information)->toBeTrue();
});

dataset('estados comerciales esperados', [
    'COM_DRAFT' => ['COM_DRAFT', true, false, false, false],
    'COM_QUOTED' => ['COM_QUOTED', false, false, false, false],
    'COM_NEGOTIATING' => ['COM_NEGOTIATING', false, false, false, false],
    'COM_APPROVED' => ['COM_APPROVED', false, true, true, false],
    'COM_REJECTED' => ['COM_REJECTED', false, true, false, true],
    'COM_CANCELLED' => ['COM_CANCELLED', false, true, false, false],
]);

test('cada estado comercial tiene la semántica exacta del controller (TERMINAL_COMMERCIAL_STATUSES)', function (
    string $code, bool $isInitial, bool $isFinal, bool $isApproved, bool $isRejected,
) {
    $status = RespelStatus::query()->where('code', $code)->firstOrFail();

    expect($status->is_initial)->toBe($isInitial)
        ->and($status->is_final)->toBe($isFinal)
        ->and($status->is_approved_status)->toBe($isApproved)
        ->and($status->is_rejected_status)->toBe($isRejected);
})->with('estados comerciales esperados');
