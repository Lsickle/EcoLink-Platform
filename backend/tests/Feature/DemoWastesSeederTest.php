<?php

use App\Models\BranchTreatment;
use App\Models\Organization;
use App\Models\Waste;
use Database\Seeders\BranchTypeSeeder;
use Database\Seeders\BusinessRoleSeeder;
use Database\Seeders\CountrySeeder;
use Database\Seeders\DemoBranchTreatmentsSeeder;
use Database\Seeders\DemoOrganizationsSeeder;
use Database\Seeders\DemoWastesSeeder;
use Database\Seeders\DepartmentSeeder;
use Database\Seeders\GenerationFrequencySeeder;
use Database\Seeders\HazardCharacteristicSeeder;
use Database\Seeders\LocalitySeeder;
use Database\Seeders\MeasurementUnitSeeder;
use Database\Seeders\MunicipalitySeeder;
use Database\Seeders\OrganizationStatusSeeder;
use Database\Seeders\PhysicalStateSeeder;
use Database\Seeders\TreatmentSeeder;
use Database\Seeders\UnCodeSeeder;
use Database\Seeders\WasteCategorySeeder;
use Database\Seeders\WasteOperationalStatusSeeder;
use Database\Seeders\WasteStreamSeeder;
use Database\Seeders\WasteTypeSeeder;

// Datos de demostración del Módulo Residuos -- 5 residuos cada una para
// Immetal (GENERATOR) y LogVerde (SUBGESTOR), NUNCA para EcoTrata (GESTOR),
// clasificados con corrientes Y/A que calzan con los `branch_treatments` ya
// sembrados de EcoTrata (ver DemoBranchTreatmentsSeeder), SIN ninguna
// WasteTreatmentApproval creada.

beforeEach(function () {
    $this->seed(OrganizationStatusSeeder::class);
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
    $this->seed(DemoWastesSeeder::class);
});

dataset('organizaciones no-gestor', [
    'Immetal (GENERATOR)' => ['900123456-1'],
    'LogVerde (SUBGESTOR)' => ['900345678-3'],
]);

test('siembra 5 residuos con el organization_id correcto para cada organización no-gestor', function (string $taxId) {
    $organization = Organization::query()->where('tax_id', $taxId)->firstOrFail();

    $wastes = Waste::query()->where('organization_id', $organization->id)->get();

    expect($wastes)->toHaveCount(5);

    foreach ($wastes as $waste) {
        expect($waste->organization_id)->toBe($organization->id);
    }
})->with('organizaciones no-gestor');

test('NO siembra ningún residuo para EcoTrata (GESTOR)', function () {
    $ecotrata = Organization::query()->where('tax_id', '900234567-2')->firstOrFail();

    expect(Waste::query()->where('organization_id', $ecotrata->id)->count())->toBe(0);
});

test('cada residuo queda en estado CLS (clasificado) con al menos una corriente Y/A asignada', function (string $taxId) {
    $organization = Organization::query()->where('tax_id', $taxId)->firstOrFail();

    $wastes = Waste::query()->where('organization_id', $organization->id)->with('wasteStreamAssignments')->get();

    foreach ($wastes as $waste) {
        expect($waste->status)->toBe('CLS')
            ->and($waste->last_classification_review_at)->not->toBeNull()
            ->and($waste->wasteStreamAssignments)->not->toBeEmpty();
    }
})->with('organizaciones no-gestor');

test('las corrientes asignadas a cada residuo SÍ están permitidas en algún branch_treatment de EcoTrata', function (string $taxId) {
    $organization = Organization::query()->where('tax_id', $taxId)->firstOrFail();

    $allowedWasteStreamIds = BranchTreatment::query()
        ->join('branch_treatment_allowed_waste_streams', 'branch_treatments.id', '=', 'branch_treatment_allowed_waste_streams.branch_treatment_id')
        ->pluck('branch_treatment_allowed_waste_streams.waste_stream_id')
        ->unique();

    expect($allowedWasteStreamIds)->not->toBeEmpty();

    $wastes = Waste::query()->where('organization_id', $organization->id)->with('wasteStreamAssignments')->get();

    foreach ($wastes as $waste) {
        $wasteStreamIds = $waste->wasteStreamAssignments->pluck('waste_stream_id');

        expect($wasteStreamIds->intersect($allowedWasteStreamIds))->not->toBeEmpty();
    }
})->with('organizaciones no-gestor');

test('ningún residuo de demo tiene una WasteTreatmentApproval creada', function () {
    $wasteIds = Waste::query()->whereIn('code', [
        'RES-IMMETAL-001', 'RES-IMMETAL-002', 'RES-IMMETAL-003', 'RES-IMMETAL-004', 'RES-IMMETAL-005',
        'RES-LOGVERDE-001', 'RES-LOGVERDE-002', 'RES-LOGVERDE-003', 'RES-LOGVERDE-004', 'RES-LOGVERDE-005',
    ])->pluck('id');

    expect($wasteIds)->toHaveCount(10);

    foreach ($wasteIds as $wasteId) {
        expect(Waste::find($wasteId)->treatmentApprovals()->count())->toBe(0);
    }
});

test('los campos obligatorios NOT NULL quedan resueltos por código de catálogo, nunca PREAPPROVED', function () {
    $wastes = Waste::query()->whereIn('code', [
        'RES-IMMETAL-001', 'RES-LOGVERDE-001',
    ])->with(['wasteType', 'measurementUnit', 'operationalStatus'])->get();

    expect($wastes)->toHaveCount(2);

    foreach ($wastes as $waste) {
        expect($waste->waste_type_id)->not->toBeNull()
            ->and($waste->wasteType->code)->not->toBe('PREAPPROVED')
            ->and($waste->measurement_unit_id)->not->toBeNull()
            ->and($waste->operational_status_id)->not->toBeNull();
    }
});

test('el seeder es idempotente (correr dos veces no duplica residuos ni asignaciones)', function () {
    $wasteCountBefore = Waste::query()->count();
    $assignmentCountBefore = DB::table('waste_stream_assignments')->count();

    $this->seed(DemoWastesSeeder::class);

    expect(Waste::query()->count())->toBe($wasteCountBefore)
        ->and(DB::table('waste_stream_assignments')->count())->toBe($assignmentCountBefore);
});

test('si una organización demo no existe, el seeder la omite sin fallar', function () {
    Organization::query()->where('tax_id', '900123456-1')->delete();

    $this->seed(DemoWastesSeeder::class);
})->throwsNoExceptions();
