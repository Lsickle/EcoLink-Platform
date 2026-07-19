<?php

namespace Database\Seeders;

use App\Models\BranchTreatment;
use App\Models\MeasurementUnit;
use App\Models\Organization;
use App\Models\PhysicalState;
use App\Models\Waste;
use App\Models\WasteCategory;
use App\Models\WasteOperationalStatus;
use App\Models\WasteStream;
use App\Models\WasteTreatmentApproval;
use App\Models\WasteType;
use Illuminate\Database\Seeder;

/**
 * Datos de demostración (no de catálogo crítico) de "Residuos Preaprobados":
 * 3 residuos de referencia (`wastes.waste_type_id` = catálogo `PREAPPROVED`)
 * para EcoTrata ("Gestión Ambiental Integral EcoTrata S.A.S.", `tax_id
 * 900234567-2`, la ÚNICA organización demo con `branch_treatments` --
 * ver `DemoBranchTreatmentsSeeder`), cada uno con clasificación (corrientes
 * Y/A reales) y una `WasteTreatmentApproval` YA aprobada (ambos ejes) contra
 * el `branch_treatment` correspondiente de EcoTrata.
 *
 * Las 3 corrientes elegidas (Y8/Y9, Y6/Y41, A1010/A1090) son las MISMAS que
 * ya usa `DemoWastesSeeder` para clasificar los residuos de Immetal/LogVerde
 * -- deliberado: hace que el mecanismo de matching dinámico YA EXISTENTE
 * (`WasteTreatmentApprovalController::preapprovedMatches()`) tenga
 * resultados reales que mostrar quiendo esos residuos lleguen al Paso 2 del
 * wizard de declaración, sin depender de que un usuario cree datos a mano
 * primero.
 *
 * AVISO EXPLÍCITO (mismo criterio que `DemoBranchTreatmentsSeeder`/
 * `DemoWastesSeeder`): los precios/cantidades comerciales son criterio
 * técnico propio (realista para el sector, en COP), NO una tarifa citada
 * literal de ninguna fuente.
 *
 * Debe correr DESPUÉS de `DemoOrganizationsSeeder`, `DemoBranchTreatmentsSeeder`
 * (necesita los `branch_treatments` ya sembrados) y `DemoWastesSeeder`
 * (dependencia lógica documentada arriba, aunque sin FK directa) y los
 * catálogos del núcleo de Residuos (`WasteTypeSeeder`, `MeasurementUnitSeeder`,
 * `WasteOperationalStatusSeeder`, `WasteCategorySeeder`, `PhysicalStateSeeder`)
 * y `WasteStreamSeeder`.
 *
 * Idempotente por `(organization_id, code)` (vía `firstOrCreate`, mismo
 * índice único parcial que `DemoWastesSeeder`) -- `code` únicos
 * `RES-PREAPROB-001..003`. La corriente Y/A y la `WasteTreatmentApproval`
 * se reemplazan/actualizan por completo en cada corrida (`sync()`/
 * `updateOrCreate()`), no duplican en corridas repetidas.
 */
class DemoPreapprovedWastesSeeder extends Seeder
{
    /**
     * @var list<array{
     *     code: string, name: string, description: string,
     *     physical_state_code: string, waste_stream_codes: list<string>,
     *     branch_treatment_internal_code: string,
     *     unit_price: float, minimum_quantity: float, maximum_quantity: float,
     *     requires_lab_analysis: bool, requires_sds: bool,
     * }>
     */
    private const PREAPPROVED_WASTES = [
        [
            'code' => 'RES-PREAPROB-001',
            'name' => 'Aceites usados aptos para coprocesamiento/recuperación',
            'description' => 'Residuo de referencia preaprobado: aceites minerales usados de mecanizado/mantenimiento, ya evaluados y aceptados bajo estos términos por la línea de Coprocesamiento de la sede Medellín.',
            'physical_state_code' => 'LIQUIDO',
            'waste_stream_codes' => ['Y8', 'Y9'],
            'branch_treatment_internal_code' => 'ECOTRATA_MEDELLIN-COPROCESAMIENTO',
            'unit_price' => 850.00,
            'minimum_quantity' => 50.00,
            'maximum_quantity' => 5000.00,
            'requires_lab_analysis' => true,
            'requires_sds' => true,
        ],
        [
            'code' => 'RES-PREAPROB-002',
            'name' => 'Solventes y trapos contaminados aptos para incineración',
            'description' => 'Residuo de referencia preaprobado: solventes halogenados y elementos contaminados con hidrocarburos, ya evaluados y aceptados bajo estos términos por la línea de Incineración de la sede Bogotá.',
            'physical_state_code' => 'SOLIDO',
            'waste_stream_codes' => ['Y6', 'Y41'],
            'branch_treatment_internal_code' => 'ECOTRATA_BOGOTA-INCINERACION',
            'unit_price' => 1200.00,
            'minimum_quantity' => 20.00,
            'maximum_quantity' => 2000.00,
            'requires_lab_analysis' => false,
            'requires_sds' => true,
        ],
        [
            'code' => 'RES-PREAPROB-003',
            'name' => 'Baterías de plomo-ácido aptas para reciclaje/aprovechamiento',
            'description' => 'Residuo de referencia preaprobado: baterías de plomo-ácido de fin de vida útil, ya evaluadas y aceptadas bajo estos términos por la línea de Reciclaje/Aprovechamiento de la sede Cali.',
            'physical_state_code' => 'SOLIDO',
            'waste_stream_codes' => ['A1010', 'A1090'],
            'branch_treatment_internal_code' => 'ECOTRATA_CALI-RECICLAJE_APROVECHAMIENTO',
            'unit_price' => 600.00,
            'minimum_quantity' => 100.00,
            'maximum_quantity' => 8000.00,
            'requires_lab_analysis' => false,
            'requires_sds' => false,
        ],
    ];

    public function run(): void
    {
        $organization = Organization::query()->where('tax_id', '900234567-2')->first();

        if (! $organization) {
            return;
        }

        $preapprovedWasteTypeId = WasteType::query()->where('code', 'PREAPPROVED')->value('id');

        if ($preapprovedWasteTypeId === null) {
            return;
        }

        $wasteCategoryId = WasteCategory::query()->where('code', 'INDUSTRIAL')->value('id');
        $measurementUnitId = MeasurementUnit::query()->where('code', 'KG')->value('id');
        $operationalStatusId = WasteOperationalStatus::query()->where('code', 'ACTIVE')->value('id');
        $physicalStateIds = PhysicalState::query()->pluck('id', 'code');
        $wasteStreamIds = WasteStream::query()->pluck('id', 'code');

        if ($measurementUnitId === null || $operationalStatusId === null) {
            return;
        }

        foreach (self::PREAPPROVED_WASTES as $entry) {
            $branchTreatment = BranchTreatment::query()
                ->where('organization_id', $organization->id)
                ->where('internal_code', $entry['branch_treatment_internal_code'])
                ->first();

            if (! $branchTreatment) {
                continue;
            }

            $waste = Waste::query()->firstOrCreate(
                ['organization_id' => $organization->id, 'code' => $entry['code']],
                [
                    'name' => $entry['name'],
                    'description' => $entry['description'],
                    'waste_type_id' => $preapprovedWasteTypeId,
                    'waste_category_id' => $wasteCategoryId,
                    'physical_state_id' => $physicalStateIds->get($entry['physical_state_code']),
                    'measurement_unit_id' => $measurementUnitId,
                    'operational_status_id' => $operationalStatusId,
                    'requires_characterization' => true,
                    'requires_sds' => $entry['requires_sds'],
                    'is_active' => true,
                ],
            );

            $waste->forceFill(['status' => 'CLS', 'last_classification_review_at' => now()])->save();

            $wasteStreamSyncData = collect($entry['waste_stream_codes'])
                ->map(fn ($code) => $wasteStreamIds->get($code))
                ->filter()
                ->mapWithKeys(fn ($id) => [$id => [
                    'organization_id' => $organization->id,
                    'classification_source' => 'MANUAL',
                    'classified_at' => now(),
                ]])
                ->all();

            $waste->wasteStreams()->sync($wasteStreamSyncData);

            // `technical_status`/`commercial_status`/los campos de aprobación
            // NO están en el Fillable del modelo (mismo criterio documentado
            // en `WasteTreatmentApproval`/`PreapprovedWasteController` --
            // solo se tocan vía las transiciones dedicadas o, como aquí,
            // vía `forceFill()` explícito). Bug latente corregido en este
            // lote (item 17/D-WF-02): antes vivían en el array de
            // `updateOrCreate()`, que los descarta en silencio por mass
            // assignment -- solo "funcionaba" en apariencia porque las 3
            // filas demo ya tenían esos valores de una corrida anterior del
            // seeder (antes de que el modelo excluyera esos campos del
            // Fillable); una corrida en un entorno realmente nuevo los habría
            // dejado en los defaults (`PENDING`/`DRAFT`).
            $approval = WasteTreatmentApproval::query()->updateOrCreate(
                ['waste_id' => $waste->id, 'branch_treatment_id' => $branchTreatment->id],
                [
                    'organization_id' => $organization->id,
                    'unit_price' => $entry['unit_price'],
                    'currency' => 'COP',
                    'billing_unit' => 'KG',
                    'minimum_quantity' => $entry['minimum_quantity'],
                    'maximum_quantity' => $entry['maximum_quantity'],
                    'requires_lab_analysis' => $entry['requires_lab_analysis'],
                    'requires_sds' => $entry['requires_sds'],
                    'is_active' => true,
                ],
            );

            $approval->forceFill([
                'technical_status' => 'APPROVED',
                'commercial_status' => 'APPROVED',
                'technical_approved_at' => now(),
                'commercial_approved_at' => now(),
            ])->save();
        }
    }
}
