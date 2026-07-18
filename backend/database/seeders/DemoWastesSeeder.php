<?php

namespace Database\Seeders;

use App\Models\GenerationFrequency;
use App\Models\HazardCharacteristic;
use App\Models\MeasurementUnit;
use App\Models\Organization;
use App\Models\PhysicalState;
use App\Models\UnCode;
use App\Models\Waste;
use App\Models\WasteCategory;
use App\Models\WasteOperationalStatus;
use App\Models\WasteStream;
use App\Models\WasteType;
use Illuminate\Database\Seeder;

/**
 * Datos de demostración (no de catálogo crítico) del Módulo Residuos: 5
 * residuos cada una para las 2 organizaciones demo que NO son EcoLink
 * (plataforma) ni Gestor -- "Industrias Metálicas del Norte S.A.S." / Immetal
 * (tax_id 900123456-1, business_role GENERATOR) y "Transportes y Logística
 * Verde S.A.S." / LogVerde (tax_id 900345678-3, business_role SUBGESTOR).
 * NO se siembran residuos para EcoTrata (Gestor) -- pedido explícito del
 * usuario.
 *
 * Cada residuo queda clasificado con al menos una corriente Y/A vía
 * `waste_stream_assignments`, escogida deliberadamente entre las corrientes
 * que SÍ están sembradas como permitidas en algún `branch_treatment` de
 * EcoTrata (ver `DemoBranchTreatmentsSeeder::WASTE_STREAM_CODES_BY_TREATMENT`,
 * único origen de verdad) -- para que el futuro flujo real
 * generador/subgestor -> gestor (Evaluación de Tratamiento vía
 * `waste_treatment_approvals`) tenga datos que de verdad calcen. Los
 * códigos UN (`waste_un_codes`) agregados son complementarios/realistas,
 * NUNCA el único criterio de clasificación -- no hay ningún
 * `branch_treatment_allowed_un_codes` sembrado todavía.
 *
 * AVISO EXPLÍCITO (mismo criterio que `DemoBranchTreatmentsSeeder`): el
 * mapeo residuo -> corrientes Y/A es criterio técnico propio (residuo
 * plausible para el sector de cada organización, cruzado contra las
 * corrientes reales de la lista de arriba), NO una norma citada literal.
 *
 * Confirmado explícitamente por el usuario: estos residuos quedan
 * ÚNICAMENTE clasificados (estado de declaración `CLS`, post-`classify()`),
 * SIN ninguna `WasteTreatmentApproval` creada -- el flujo manual de
 * evaluación por el Gestor se prueba a mano después, no se siembra aquí.
 *
 * Debe correr DESPUÉS de `DemoOrganizationsSeeder` (necesita las
 * organizaciones), `DemoBranchTreatmentsSeeder` (dependencia lógica de
 * negocio -- las corrientes usadas aquí se eligieron para calzar con los
 * `branch_treatments` de EcoTrata ya sembrados, aunque no hay FK directa) y
 * los catálogos del núcleo del Módulo Residuos (`WasteTypeSeeder`,
 * `MeasurementUnitSeeder`, `GenerationFrequencySeeder`,
 * `WasteOperationalStatusSeeder`, `WasteCategorySeeder`, `PhysicalStateSeeder`,
 * `HazardCharacteristicSeeder`), `WasteStreamSeeder` y `UnCodeSeeder`.
 *
 * `waste_type_id` nunca usa el código `PREAPPROVED` (reservado para
 * residuos de referencia, no residuos reales declarados por un Generador/
 * Subgestor -- pedido explícito del usuario).
 *
 * Idempotente por `(organization_id, code)` (vía `firstOrCreate`, mismo
 * índice único parcial de la migración de `wastes`) -- `code` únicos
 * `RES-IMMETAL-001..005` / `RES-LOGVERDE-001..005`. Las corrientes Y/A,
 * códigos UN y características de peligrosidad se reemplazan por completo
 * en cada corrida (`sync()`, mismo patrón que
 * `WasteController::syncWasteStreams()`/`syncUnCodes()`/
 * `syncHazardCharacteristics()`) -- no duplican en corridas repetidas.
 */
class DemoWastesSeeder extends Seeder
{
    /**
     * @var array<string, list<array{
     *     code: string, name: string, description: string,
     *     waste_type_code: string, waste_category_code: string,
     *     physical_state_code: string, measurement_unit_code: string,
     *     generation_frequency_code: string, quantity: float,
     *     hazard_codes: list<string>, waste_stream_codes: list<string>,
     *     un_codes: list<string>,
     * }>>
     */
    private const WASTES_BY_TAX_ID = [
        // Industrias Metálicas del Norte S.A.S. (Immetal) -- Generador.
        '900123456-1' => [
            [
                'code' => 'RES-IMMETAL-001',
                'name' => 'Aceite usado de mecanizado y corte',
                'description' => 'Aceite mineral usado en operaciones de mecanizado y corte de piezas metálicas, con presencia de finos metálicos.',
                'waste_type_code' => 'OPERATIONAL',
                'waste_category_code' => 'INDUSTRIAL',
                'physical_state_code' => 'LIQUIDO',
                'measurement_unit_code' => 'LT',
                'generation_frequency_code' => 'WEEKLY',
                'quantity' => 350.00,
                'hazard_codes' => ['INF', 'ECO'],
                'waste_stream_codes' => ['Y8', 'Y9'], // RECUPERACION_ACEITES / COPROCESAMIENTO (EcoTrata Cali/Medellín)
                'un_codes' => ['UN1268'],
            ],
            [
                'code' => 'RES-IMMETAL-002',
                'name' => 'Lodos de tratamiento de aguas residuales industriales',
                'description' => 'Lodos generados en la planta de tratamiento de aguas residuales del proceso de recubrimiento metálico, con contenido de metales pesados.',
                'waste_type_code' => 'OPERATIONAL',
                'waste_category_code' => 'INDUSTRIAL',
                'physical_state_code' => 'LODO',
                'measurement_unit_code' => 'KG',
                'generation_frequency_code' => 'MONTHLY',
                'quantity' => 1200.00,
                'hazard_codes' => ['TOX', 'COR'],
                'waste_stream_codes' => ['Y17', 'A1050'], // TRATAMIENTO_LODOS (EcoTrata Cali)
                'un_codes' => ['UN3077'],
            ],
            [
                'code' => 'RES-IMMETAL-003',
                'name' => 'Solventes usados de limpieza y desengrase de piezas',
                'description' => 'Solventes orgánicos e hidrocarburos halogenados usados en el desengrase de piezas metálicas antes del proceso de pintura.',
                'waste_type_code' => 'COMMON',
                'waste_category_code' => 'INDUSTRIAL',
                'physical_state_code' => 'LIQUIDO',
                'measurement_unit_code' => 'LT',
                'generation_frequency_code' => 'WEEKLY',
                'quantity' => 180.00,
                'hazard_codes' => ['INF'],
                'waste_stream_codes' => ['Y6', 'Y41'], // INCINERACION (EcoTrata Bogotá)
                'un_codes' => ['UN1993'],
            ],
            [
                'code' => 'RES-IMMETAL-004',
                'name' => 'Baños agotados de tratamiento térmico con cianuros',
                'description' => 'Baños agotados del proceso de cementación/tratamiento térmico con contenido de cianuros inorgánicos, retirados por vencimiento de vida útil.',
                'waste_type_code' => 'OPERATIONAL',
                'waste_category_code' => 'INDUSTRIAL',
                'physical_state_code' => 'LIQUIDO',
                'measurement_unit_code' => 'LT',
                'generation_frequency_code' => 'MONTHLY',
                'quantity' => 450.00,
                'hazard_codes' => ['TOX', 'COR'],
                'waste_stream_codes' => ['Y7', 'Y33'], // TRATAMIENTO_FISICOQUIMICO (EcoTrata Bogotá)
                'un_codes' => ['UN2810'],
            ],
            [
                'code' => 'RES-IMMETAL-005',
                'name' => 'Escoria y polvo de horno de fundición',
                'description' => 'Escoria y polvo de horno del proceso de fundición, con contenido de compuestos de cobre y zinc.',
                'waste_type_code' => 'OPERATIONAL',
                'waste_category_code' => 'INDUSTRIAL',
                'physical_state_code' => 'SOLIDO',
                'measurement_unit_code' => 'KG',
                'generation_frequency_code' => 'MONTHLY',
                'quantity' => 900.00,
                'hazard_codes' => ['TOX'],
                'waste_stream_codes' => ['Y22', 'Y23'], // ESTABILIZACION_ENCAPSULAMIENTO (EcoTrata Medellín)
                'un_codes' => ['UN3243'],
            ],
        ],
        // Transportes y Logística Verde S.A.S. (LogVerde) -- Subgestor.
        '900345678-3' => [
            [
                'code' => 'RES-LOGVERDE-001',
                'name' => 'Baterías usadas de plomo-ácido de la flota vehicular',
                'description' => 'Baterías de plomo-ácido retiradas por fin de vida útil de los vehículos de la flota de transporte propia.',
                'waste_type_code' => 'COMMON',
                'waste_category_code' => 'POSCONSUMO',
                'physical_state_code' => 'SOLIDO',
                'measurement_unit_code' => 'KG',
                'generation_frequency_code' => 'OCCASIONAL',
                'quantity' => 240.00,
                'hazard_codes' => ['COR', 'TOX'],
                'waste_stream_codes' => ['A1010', 'A1090'], // RECICLAJE_APROVECHAMIENTO (EcoTrata Cali)
                'un_codes' => ['UN2794'],
            ],
            [
                'code' => 'RES-LOGVERDE-002',
                'name' => 'Filtros de aceite usados de mantenimiento vehicular',
                'description' => 'Filtros de aceite retirados en el mantenimiento preventivo de la flota, con residuo de aceite mineral usado.',
                'waste_type_code' => 'COMMON',
                'waste_category_code' => 'INDUSTRIAL',
                'physical_state_code' => 'SOLIDO',
                'measurement_unit_code' => 'KG',
                'generation_frequency_code' => 'MONTHLY',
                'quantity' => 85.00,
                'hazard_codes' => ['INF', 'ECO'],
                'waste_stream_codes' => ['Y8', 'Y9'], // RECUPERACION_ACEITES / COPROCESAMIENTO (EcoTrata Cali/Medellín)
                'un_codes' => ['UN1268'],
            ],
            [
                'code' => 'RES-LOGVERDE-003',
                'name' => 'Aceite usado de motor y transmisión',
                'description' => 'Aceite mineral usado de motor y transmisión, drenado en el mantenimiento periódico de la flota de transporte.',
                'waste_type_code' => 'COMMON',
                'waste_category_code' => 'INDUSTRIAL',
                'physical_state_code' => 'LIQUIDO',
                'measurement_unit_code' => 'LT',
                'generation_frequency_code' => 'MONTHLY',
                'quantity' => 310.00,
                'hazard_codes' => ['INF', 'ECO'],
                'waste_stream_codes' => ['Y8', 'Y11'], // COPROCESAMIENTO (EcoTrata Medellín)
                'un_codes' => ['UN1268'],
            ],
            [
                'code' => 'RES-LOGVERDE-004',
                'name' => 'Trapos y EPP contaminados con hidrocarburos',
                'description' => 'Trapos, estopas y elementos de protección personal contaminados con hidrocarburos, generados en el taller de mantenimiento de la flota.',
                'waste_type_code' => 'OPERATIONAL',
                'waste_category_code' => 'INDUSTRIAL',
                'physical_state_code' => 'SOLIDO',
                'measurement_unit_code' => 'KG',
                'generation_frequency_code' => 'WEEKLY',
                'quantity' => 60.00,
                'hazard_codes' => ['INF'],
                'waste_stream_codes' => ['Y6', 'Y41'], // INCINERACION (EcoTrata Bogotá)
                'un_codes' => ['UN3175'],
            ],
            [
                'code' => 'RES-LOGVERDE-005',
                'name' => 'Residuos de lavado de tanques y contenedores de transporte',
                'description' => 'Aguas y lodos residuales del lavado interno de tanques y contenedores usados en el transporte de sustancias químicas.',
                'waste_type_code' => 'OPERATIONAL',
                'waste_category_code' => 'INDUSTRIAL',
                'physical_state_code' => 'LODO',
                'measurement_unit_code' => 'LT',
                'generation_frequency_code' => 'WEEKLY',
                'quantity' => 220.00,
                'hazard_codes' => ['COR'],
                'waste_stream_codes' => ['Y7', 'Y34'], // TRATAMIENTO_FISICOQUIMICO (EcoTrata Bogotá)
                'un_codes' => ['UN1760'],
            ],
        ],
    ];

    public function run(): void
    {
        $wasteTypeIds = WasteType::query()->pluck('id', 'code');
        $wasteCategoryIds = WasteCategory::query()->pluck('id', 'code');
        $physicalStateIds = PhysicalState::query()->pluck('id', 'code');
        $measurementUnitIds = MeasurementUnit::query()->pluck('id', 'code');
        $generationFrequencyIds = GenerationFrequency::query()->pluck('id', 'code');
        $operationalStatusIds = WasteOperationalStatus::query()->pluck('id', 'code');
        $hazardCharacteristicIds = HazardCharacteristic::query()->pluck('id', 'code');
        $wasteStreamIds = WasteStream::query()->pluck('id', 'code');
        $unCodeIds = UnCode::query()->pluck('id', 'code');

        $activeOperationalStatusId = $operationalStatusIds->get('ACTIVE');

        foreach (self::WASTES_BY_TAX_ID as $taxId => $wastes) {
            $organization = Organization::query()->where('tax_id', $taxId)->first();

            if (! $organization) {
                continue;
            }

            foreach ($wastes as $wasteData) {
                $waste = Waste::query()->firstOrCreate(
                    ['organization_id' => $organization->id, 'code' => $wasteData['code']],
                    [
                        'name' => $wasteData['name'],
                        'description' => $wasteData['description'],
                        'waste_type_id' => $wasteTypeIds->get($wasteData['waste_type_code']),
                        'waste_category_id' => $wasteCategoryIds->get($wasteData['waste_category_code']),
                        'physical_state_id' => $physicalStateIds->get($wasteData['physical_state_code']),
                        'measurement_unit_id' => $measurementUnitIds->get($wasteData['measurement_unit_code']),
                        'generation_frequency_id' => $generationFrequencyIds->get($wasteData['generation_frequency_code']),
                        'operational_status_id' => $activeOperationalStatusId,
                        'quantity' => $wasteData['quantity'],
                        'generation_date' => now()->subDays(random_int(5, 60))->toDateString(),
                        'requires_characterization' => true,
                        'requires_sds' => true,
                        'requires_special_transport' => true,
                        'is_active' => true,
                    ],
                );

                // Corrientes Y/A -- reemplazo completo, mismo patrón que
                // WasteController::syncWasteStreams().
                $wasteStreamSyncData = collect($wasteData['waste_stream_codes'])
                    ->map(fn ($code) => $wasteStreamIds->get($code))
                    ->filter()
                    ->mapWithKeys(fn ($id) => [$id => [
                        'organization_id' => $organization->id,
                        'classification_source' => 'MANUAL',
                        'classified_at' => now(),
                    ]])
                    ->all();

                $waste->wasteStreams()->sync($wasteStreamSyncData);

                // Códigos UN -- complementario, mismo patrón que
                // WasteController::syncUnCodes(). NUNCA el único criterio de
                // clasificación (ver docblock de la clase).
                $unCodeSyncData = collect($wasteData['un_codes'])
                    ->map(fn ($code) => $unCodeIds->get($code))
                    ->filter()
                    ->mapWithKeys(fn ($id) => [$id => [
                        'classification_source' => 'MANUAL',
                        'classified_at' => now(),
                    ]])
                    ->all();

                $waste->unCodes()->sync($unCodeSyncData);

                // Características de peligrosidad -- recalcula `waste_danger`
                // (derivado/cache), mismo patrón que
                // WasteController::syncHazardCharacteristics().
                $hazardSyncData = collect($wasteData['hazard_codes'])
                    ->map(fn ($code) => $hazardCharacteristicIds->get($code))
                    ->filter()
                    ->mapWithKeys(fn ($id) => [$id => []])
                    ->all();

                $waste->hazardCharacteristics()->sync($hazardSyncData);
                $waste->recalculateWasteDanger();

                // Estado de declaración: ya clasificado (`CLS`, post-
                // `classify()`), listo para que un Gestor lo evalúe -- SIN
                // ninguna `WasteTreatmentApproval` creada (pedido explícito
                // del usuario, ver docblock de la clase).
                $waste->forceFill([
                    'status' => 'CLS',
                    'last_classification_review_at' => now(),
                ])->save();
            }
        }
    }
}
