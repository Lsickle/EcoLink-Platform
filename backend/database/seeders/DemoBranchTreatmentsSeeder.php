<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\BranchTreatment;
use App\Models\Organization;
use App\Models\Treatment;
use App\Models\WasteStream;
use Illuminate\Database\Seeder;

/**
 * Datos de demostración (no de catálogo crítico) del Módulo Tratamiento:
 * habilita 2-3 `branch_treatments` (del catálogo de 15 sembrado por
 * `TreatmentSeeder`) en cada una de las 3 sedes de la organización demo
 * Gestor ("Gestión Ambiental Integral EcoTrata S.A.S.", `tax_id
 * 900234567-2`, la ÚNICA de las 3 organizaciones demo con business_role
 * GESTOR / `can_treat_waste=true` -- ver `DemoOrganizationsSeeder`), cada
 * uno con 2-4 corrientes de residuo asociadas vía
 * `branch_treatment_allowed_waste_streams`.
 *
 * Debe correr DESPUÉS de `DemoOrganizationsSeeder` (necesita la
 * organización/sedes), `TreatmentSeeder` (necesita el catálogo) y
 * `WasteStreamSeeder` (necesita las corrientes reales por código).
 *
 * AVISO EXPLÍCITO: el mapeo tratamiento -> corrientes compatibles es
 * investigación propia (criterio técnico, cross-referenciada con las
 * categorías Y/A ya sembradas en `data_waste_streams.json`), NO una norma
 * citada literal -- confirmado con el usuario. Selección de tratamientos
 * por sede y subconjunto de corrientes por tratamiento (2-4 de la lista
 * completa de compatibilidad) es una elección deliberada de este seeder de
 * demo, no aleatoria en el sentido de `rand()` -- mantiene los datos de
 * demo reproducibles entre corridas de `migrate:fresh --seed`.
 *
 * Idempotente por `internal_code` (vía `updateOrCreate`) y por
 * `(branch_treatment_id, waste_stream_id)` en la pivote (vía `sync()`).
 */
class DemoBranchTreatmentsSeeder extends Seeder
{
    /**
     * @var array<string, list<string>>
     */
    private const WASTE_STREAM_CODES_BY_TREATMENT = [
        'INCINERACION' => ['Y1', 'Y1.1', 'Y6', 'Y41'],
        'COPROCESAMIENTO' => ['Y6', 'Y8', 'Y9', 'Y11'],
        'TRATAMIENTO_FISICOQUIMICO' => ['Y7', 'Y21', 'Y33', 'Y34'],
        'COMPOSTAJE' => [], // Tratamiento de orgánicos no peligrosos -- sin corrientes RESPEL asociadas (deliberado, no un olvido).
        'ESTABILIZACION_ENCAPSULAMIENTO' => ['Y20', 'Y21', 'Y22', 'Y23'],
        'RECICLAJE_APROVECHAMIENTO' => ['Y22', 'Y23', 'A1010', 'A1090'],
        'TRATAMIENTO_LODOS' => ['Y17', 'A1050', 'A4060'],
        'RECUPERACION_ACEITES' => ['Y8', 'Y9', 'A4060'],
    ];

    /**
     * @var array<string, list<array{treatment_code: string, license: string, capacity: float}>>
     */
    private const BRANCH_TREATMENTS_BY_BRANCH_CODE = [
        'ECOTRATA_BOGOTA' => [
            ['treatment_code' => 'INCINERACION', 'license' => 'LIC-AMB-BOG-001', 'capacity' => 5000],
            ['treatment_code' => 'TRATAMIENTO_FISICOQUIMICO', 'license' => 'LIC-AMB-BOG-002', 'capacity' => 8000],
            ['treatment_code' => 'COMPOSTAJE', 'license' => 'LIC-AMB-BOG-003', 'capacity' => 2000],
        ],
        'ECOTRATA_MEDELLIN' => [
            ['treatment_code' => 'COPROCESAMIENTO', 'license' => 'LIC-AMB-MED-001', 'capacity' => 12000],
            ['treatment_code' => 'ESTABILIZACION_ENCAPSULAMIENTO', 'license' => 'LIC-AMB-MED-002', 'capacity' => 6000],
        ],
        'ECOTRATA_CALI' => [
            ['treatment_code' => 'RECICLAJE_APROVECHAMIENTO', 'license' => 'LIC-AMB-CAL-001', 'capacity' => 4000],
            ['treatment_code' => 'TRATAMIENTO_LODOS', 'license' => 'LIC-AMB-CAL-002', 'capacity' => 7000],
            ['treatment_code' => 'RECUPERACION_ACEITES', 'license' => 'LIC-AMB-CAL-003', 'capacity' => 3000],
        ],
    ];

    public function run(): void
    {
        $organization = Organization::query()->where('tax_id', '900234567-2')->first();

        if (! $organization) {
            return;
        }

        $treatmentIds = Treatment::query()->pluck('id', 'code');
        $wasteStreamIds = WasteStream::query()->pluck('id', 'code');

        foreach (self::BRANCH_TREATMENTS_BY_BRANCH_CODE as $branchCode => $entries) {
            $branch = Branch::query()->where('organization_id', $organization->id)->where('code', $branchCode)->first();

            if (! $branch) {
                continue;
            }

            foreach ($entries as $entry) {
                $treatmentId = $treatmentIds->get($entry['treatment_code']);

                if ($treatmentId === null) {
                    continue;
                }

                $branchTreatment = BranchTreatment::query()->updateOrCreate(
                    ['internal_code' => "{$branchCode}-{$entry['treatment_code']}"],
                    [
                        'organization_id' => $organization->id,
                        'branch_id' => $branch->id,
                        'treatment_id' => $treatmentId,
                        'operational_name' => "Línea de {$entry['treatment_code']} - {$branch->name}",
                        'max_capacity' => $entry['capacity'],
                        'capacity_unit' => 'KG',
                        'daily_capacity' => $entry['capacity'] / 30,
                        'monthly_capacity' => $entry['capacity'],
                        'environmental_license_number' => $entry['license'],
                        'valid_from' => now()->subYear()->toDateString(),
                        'valid_until' => now()->addYears(2)->toDateString(),
                        'requires_manual_approval' => false,
                        'allows_mixed_waste' => false,
                        'requires_weight_validation' => true,
                        'operational_status' => 'ACTIVE',
                        'is_active' => true,
                    ],
                );

                $codes = self::WASTE_STREAM_CODES_BY_TREATMENT[$entry['treatment_code']] ?? [];
                $ids = collect($codes)->map(fn ($code) => $wasteStreamIds->get($code))->filter()->values()->all();

                $branchTreatment->allowedWasteStreams()->sync($ids);
            }
        }
    }
}
