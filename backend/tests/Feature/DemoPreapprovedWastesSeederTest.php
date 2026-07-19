<?php

use App\Models\BranchTreatment;
use App\Models\Organization;
use App\Models\Waste;
use App\Models\WasteTreatmentApproval;
use App\Models\WasteType;
use Database\Seeders\BranchTypeSeeder;
use Database\Seeders\BusinessRoleSeeder;
use Database\Seeders\CountrySeeder;
use Database\Seeders\DemoBranchTreatmentsSeeder;
use Database\Seeders\DemoOrganizationsSeeder;
use Database\Seeders\DemoPreapprovedWastesSeeder;
use Database\Seeders\DepartmentSeeder;
use Database\Seeders\GenerationFrequencySeeder;
use Database\Seeders\HazardCharacteristicSeeder;
use Database\Seeders\LocalitySeeder;
use Database\Seeders\MeasurementUnitSeeder;
use Database\Seeders\MunicipalitySeeder;
use Database\Seeders\OrganizationStatusSeeder;
use Database\Seeders\PhysicalStateSeeder;
use Database\Seeders\PlatformOrganizationSeeder;
use Database\Seeders\RespelStatusSeeder;
use Database\Seeders\TreatmentSeeder;
use Database\Seeders\UnCodeSeeder;
use Database\Seeders\WasteCategorySeeder;
use Database\Seeders\WasteOperationalStatusSeeder;
use Database\Seeders\WasteStreamSeeder;
use Database\Seeders\WasteTypeSeeder;

// Datos de demostración de "Residuos Preaprobados" -- 3 residuos de
// referencia para EcoTrata (única organización demo con branch_treatments),
// cada uno con una WasteTreatmentApproval ya aprobada (ambos ejes) contra el
// branch_treatment correspondiente.

beforeEach(function () {
    $this->seed(OrganizationStatusSeeder::class);
    $this->seed(PlatformOrganizationSeeder::class);
    $this->seed(RespelStatusSeeder::class);
    $this->seed(BusinessRoleSeeder::class);
    $this->seed(CountrySeeder::class);
    $this->seed(DepartmentSeeder::class);
    $this->seed(MunicipalitySeeder::class);
    $this->seed(LocalitySeeder::class);
    $this->seed(BranchTypeSeeder::class);
    $this->seed(DemoOrganizationsSeeder::class);
    $this->seed(WasteStreamSeeder::class);
    $this->seed(UnCodeSeeder::class);
    $this->seed(HazardCharacteristicSeeder::class);
    $this->seed(WasteCategorySeeder::class);
    $this->seed(PhysicalStateSeeder::class);
    $this->seed(TreatmentSeeder::class);
    $this->seed(WasteTypeSeeder::class);
    $this->seed(MeasurementUnitSeeder::class);
    $this->seed(GenerationFrequencySeeder::class);
    $this->seed(WasteOperationalStatusSeeder::class);
    $this->seed(DemoBranchTreatmentsSeeder::class);
    $this->seed(DemoPreapprovedWastesSeeder::class);
});

test('siembra 3 residuos preaprobados para EcoTrata, con waste_type_id=PREAPPROVED', function () {
    $ecotrata = Organization::query()->where('tax_id', '900234567-2')->firstOrFail();
    $preapprovedWasteTypeId = WasteType::query()->where('code', 'PREAPPROVED')->value('id');

    $wastes = Waste::query()->where('organization_id', $ecotrata->id)->where('waste_type_id', $preapprovedWasteTypeId)->get();

    expect($wastes)->toHaveCount(3);

    foreach ($wastes as $waste) {
        expect($waste->organization_id)->toBe($ecotrata->id)
            ->and($waste->waste_type_id)->toBe($preapprovedWasteTypeId)
            ->and($waste->status)->toBe('CLS')
            ->and($waste->is_active)->toBeTrue();
    }
});

test('cada residuo preaprobado tiene al menos una corriente Y/A asignada', function () {
    $ecotrata = Organization::query()->where('tax_id', '900234567-2')->firstOrFail();

    $wastes = Waste::query()->whereIn('code', ['RES-PREAPROB-001', 'RES-PREAPROB-002', 'RES-PREAPROB-003'])
        ->where('organization_id', $ecotrata->id)
        ->with('wasteStreamAssignments')
        ->get();

    expect($wastes)->toHaveCount(3);

    foreach ($wastes as $waste) {
        expect($waste->wasteStreamAssignments)->not->toBeEmpty();
    }
});

test('cada residuo preaprobado tiene una WasteTreatmentApproval con AMBOS ejes APPROVED contra un branch_treatment de EcoTrata', function () {
    $ecotrata = Organization::query()->where('tax_id', '900234567-2')->firstOrFail();

    $wastes = Waste::query()->whereIn('code', ['RES-PREAPROB-001', 'RES-PREAPROB-002', 'RES-PREAPROB-003'])
        ->where('organization_id', $ecotrata->id)
        ->get();

    expect($wastes)->toHaveCount(3);

    foreach ($wastes as $waste) {
        $approval = WasteTreatmentApproval::query()->where('waste_id', $waste->id)->first();

        expect($approval)->not->toBeNull()
            ->and($approval->technical_status)->toBe('APPROVED')
            ->and($approval->commercial_status)->toBe('APPROVED')
            ->and($approval->is_active)->toBeTrue()
            ->and($approval->organization_id)->toBe($ecotrata->id);

        $branchTreatment = BranchTreatment::query()->find($approval->branch_treatment_id);
        expect($branchTreatment)->not->toBeNull()
            ->and($branchTreatment->organization_id)->toBe($ecotrata->id);
    }
});

test('las corrientes de los residuos preaprobados calzan con corrientes ya usadas por DemoWastesSeeder (Y8/Y9, Y6/Y41, A1010/A1090)', function () {
    $streamsByCode = collect(['RES-PREAPROB-001' => ['Y8', 'Y9'], 'RES-PREAPROB-002' => ['Y6', 'Y41'], 'RES-PREAPROB-003' => ['A1010', 'A1090']]);

    foreach ($streamsByCode as $code => $expectedCodes) {
        $waste = Waste::query()->where('code', $code)->with('wasteStreamAssignments.wasteStream')->firstOrFail();
        $actualCodes = $waste->wasteStreamAssignments->pluck('wasteStream.code')->sort()->values()->all();

        expect($actualCodes)->toBe(collect($expectedCodes)->sort()->values()->all());
    }
});

test('si EcoTrata no existe, el seeder no falla', function () {
    Organization::query()->where('tax_id', '900234567-2')->delete();

    $this->seed(DemoPreapprovedWastesSeeder::class);
})->throwsNoExceptions();

test('el seeder es idempotente (correr dos veces no duplica residuos ni aprobaciones)', function () {
    $wasteCountBefore = Waste::query()->count();
    $approvalCountBefore = WasteTreatmentApproval::query()->count();

    $this->seed(DemoPreapprovedWastesSeeder::class);

    expect(Waste::query()->count())->toBe($wasteCountBefore)
        ->and(WasteTreatmentApproval::query()->count())->toBe($approvalCountBefore);
});
