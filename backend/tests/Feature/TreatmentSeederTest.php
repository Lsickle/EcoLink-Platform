<?php

use App\Models\Branch;
use App\Models\BranchTreatment;
use App\Models\Organization;
use App\Models\Treatment;
use Database\Seeders\BranchTypeSeeder;
use Database\Seeders\BusinessRoleSeeder;
use Database\Seeders\CountrySeeder;
use Database\Seeders\DemoBranchTreatmentsSeeder;
use Database\Seeders\DemoOrganizationsSeeder;
use Database\Seeders\DepartmentSeeder;
use Database\Seeders\LocalitySeeder;
use Database\Seeders\MunicipalitySeeder;
use Database\Seeders\OrganizationStatusSeeder;
use Database\Seeders\TreatmentSeeder;
use Database\Seeders\WasteStreamSeeder;

// Catálogo GLOBAL "Tratamientos" (Módulo Tratamiento, RN-063/D-R02) -- 15
// tratamientos REALES (Decreto 4741/2005 y su compilación en el Decreto
// 1076 de 2015, categorías RUA/IDEAM) + datos de demo del Gestor.

beforeEach(function () {
    $this->seed(TreatmentSeeder::class);
});

test('siembra exactamente 15 tratamientos', function () {
    expect(Treatment::query()->count())->toBe(15);
});

test('el seeder es idempotente (correr dos veces no duplica filas)', function () {
    $this->seed(TreatmentSeeder::class);

    expect(Treatment::query()->count())->toBe(15);
});

dataset('tratamientos esperados', [
    'INCINERACION' => ['INCINERACION', 'THERMAL', false, true, 'HIGH', '900.00', '1200.00'],
    'COPROCESAMIENTO' => ['COPROCESAMIENTO', 'THERMAL', true, true, 'HIGH', '1200.00', '1500.00'],
    'TRATAMIENTO_TERMICO_SIN_COMBUSTION' => ['TRATAMIENTO_TERMICO_SIN_COMBUSTION', 'THERMAL', false, true, 'MEDIUM', '121.00', '134.00'],
    'DESACTIVACION_ALTA_EFICIENCIA' => ['DESACTIVACION_ALTA_EFICIENCIA', 'CHEMICAL', false, true, 'MEDIUM', null, null],
    'DESACTIVACION_BAJA_EFICIENCIA' => ['DESACTIVACION_BAJA_EFICIENCIA', 'CHEMICAL', false, true, 'MEDIUM', null, null],
    'TRATAMIENTO_FISICOQUIMICO' => ['TRATAMIENTO_FISICOQUIMICO', 'PHYSICOCHEMICAL', false, true, 'MEDIUM', null, null],
    'TRATAMIENTO_AGUAS_RESIDUALES' => ['TRATAMIENTO_AGUAS_RESIDUALES', 'LIQUID', false, true, 'MEDIUM', null, null],
    'TRATAMIENTO_LODOS' => ['TRATAMIENTO_LODOS', 'SLUDGE', false, true, 'MEDIUM', null, null],
    'ESTABILIZACION_ENCAPSULAMIENTO' => ['ESTABILIZACION_ENCAPSULAMIENTO', 'STABILIZATION', false, true, 'MEDIUM', null, null],
    'RELLENO_SEGURIDAD' => ['RELLENO_SEGURIDAD', 'DISPOSAL', false, true, 'HIGH', null, null],
    'TRATAMIENTO_BIOLOGICO' => ['TRATAMIENTO_BIOLOGICO', 'BIOLOGICAL', false, true, 'MEDIUM', null, null],
    'COMPOSTAJE' => ['COMPOSTAJE', 'BIOLOGICAL', true, false, 'LOW', null, null],
    'RECUPERACION_ACEITES' => ['RECUPERACION_ACEITES', 'RECOVERY', true, true, 'MEDIUM', null, null],
    'RECICLAJE_APROVECHAMIENTO' => ['RECICLAJE_APROVECHAMIENTO', 'RECOVERY', true, false, 'LOW', null, null],
    'TRATAMIENTO_FISICO' => ['TRATAMIENTO_FISICO', 'PHYSICAL', false, false, 'LOW', null, null],
]);

test('cada tratamiento tiene los atributos exactos confirmados', function (
    string $code, string $treatmentType, bool $allowsRecovery, bool $requiresLicense,
    string $riskLevel, ?string $minTemp, ?string $maxTemp,
) {
    $treatment = Treatment::query()->where('code', $code)->firstOrFail();

    expect($treatment->treatment_type)->toBe($treatmentType)
        ->and($treatment->allows_recovery)->toBe($allowsRecovery)
        ->and($treatment->requires_environmental_license)->toBe($requiresLicense)
        ->and($treatment->risk_level)->toBe($riskLevel)
        ->and($treatment->min_temperature)->toBe($minTemp)
        ->and($treatment->max_temperature)->toBe($maxTemp)
        ->and($treatment->is_system)->toBeTrue()
        ->and($treatment->is_active)->toBeTrue()
        ->and($treatment->tenant_organization_id)->toBeNull();
})->with('tratamientos esperados');

test('TRATAMIENTO_FISICO es el único sin requires_certificate', function () {
    $treatments = Treatment::query()->pluck('requires_certificate', 'code');

    expect($treatments['TRATAMIENTO_FISICO'])->toBeFalse();

    foreach ($treatments as $code => $requiresCertificate) {
        if ($code !== 'TRATAMIENTO_FISICO') {
            expect($requiresCertificate)->toBeTrue();
        }
    }
});

// ---- Datos de demo: DemoBranchTreatmentsSeeder ----

describe('DemoBranchTreatmentsSeeder', function () {
    beforeEach(function () {
        $this->seed(OrganizationStatusSeeder::class);
        $this->seed(BusinessRoleSeeder::class);
        $this->seed(CountrySeeder::class);
        $this->seed(DepartmentSeeder::class);
        $this->seed(MunicipalitySeeder::class);
        $this->seed(LocalitySeeder::class);
        $this->seed(BranchTypeSeeder::class);
        $this->seed(WasteStreamSeeder::class);
        $this->seed(DemoOrganizationsSeeder::class);
        $this->seed(DemoBranchTreatmentsSeeder::class);
    });

    test('la organización demo Gestor (EcoTrata) tiene branch_treatments en sus 3 sedes', function () {
        $organization = Organization::query()->where('tax_id', '900234567-2')->firstOrFail();
        $branchIds = Branch::query()->where('organization_id', $organization->id)->pluck('id');

        expect($branchIds)->toHaveCount(3);

        foreach ($branchIds as $branchId) {
            $count = BranchTreatment::query()->where('branch_id', $branchId)->count();
            expect($count)->toBeGreaterThanOrEqual(2)->toBeLessThanOrEqual(3);
        }
    });

    test('cada branch_treatment de demo (salvo COMPOSTAJE) tiene corrientes de residuo asociadas', function () {
        $organization = Organization::query()->where('tax_id', '900234567-2')->firstOrFail();

        $branchTreatments = BranchTreatment::query()
            ->where('organization_id', $organization->id)
            ->with(['treatment', 'allowedWasteStreams'])
            ->get();

        expect($branchTreatments)->not->toBeEmpty();

        foreach ($branchTreatments as $branchTreatment) {
            if ($branchTreatment->treatment->code === 'COMPOSTAJE') {
                expect($branchTreatment->allowedWasteStreams)->toHaveCount(0);

                continue;
            }

            expect($branchTreatment->allowedWasteStreams->count())->toBeGreaterThanOrEqual(2)
                ->toBeLessThanOrEqual(4);
        }
    });

    test('el seeder es idempotente (correr dos veces no duplica branch_treatments)', function () {
        $countBefore = BranchTreatment::query()->count();

        $this->seed(DemoBranchTreatmentsSeeder::class);

        expect(BranchTreatment::query()->count())->toBe($countBefore);
    });
});
