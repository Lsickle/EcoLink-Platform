<?php

namespace Database\Seeders;

use App\Models\Organization;
use App\Models\OrganizationalArea;
use Illuminate\Database\Seeder;

/**
 * Datos de demostración (no de catálogo crítico) del módulo "Áreas
 * Organizacionales": siembra una jerarquía simple (1 área raíz + 3 áreas
 * hijas) por cada una de las 3 organizaciones demo ya sembradas por
 * `DemoOrganizationsSeeder` (Immetal/GENERATOR, EcoTrata/GESTOR,
 * LogVerde/SUBGESTOR), coherente con el `business_role` de cada una.
 *
 * `organization_id` se resuelve SIEMPRE en runtime consultando
 * `Organization::where('tax_id', ...)` -- NUNCA hardcodeado -- mismo
 * criterio que `DemoBranchTreatmentsSeeder`. `level` usa literalmente los 3
 * valores de `OrganizationalAreaController::LEVELS`
 * ('Dirección'/'Gerencia'/'Coordinación').
 *
 * Debe correr DESPUÉS de `DemoOrganizationsSeeder` (necesita las
 * organizaciones demo ya sembradas) -- si una organización aún no existe,
 * esta organización se omite silenciosamente (mismo criterio que
 * `DemoBranchTreatmentsSeeder::run()`).
 *
 * Idempotente por el UNIQUE compuesto real de la tabla
 * `(organization_id, code)`, vía `firstOrCreate`. `code` se repite entre
 * organizaciones distintas (p. ej. 'DIR' en las 3) a propósito -- el
 * UNIQUE es compuesto, no global.
 */
class OrganizationalAreaSeeder extends Seeder
{
    /**
     * @var array<string, array{tax_id: string, areas: list<array{code: string, name: string, level: string, parent_code: ?string}>}>
     */
    private const AREAS_BY_ORGANIZATION = [
        // Immetal (GENERATOR, tax_id 900123456-1): estructura de una planta
        // industrial generadora de residuos.
        'IMMETAL' => [
            'tax_id' => '900123456-1',
            'areas' => [
                ['code' => 'DIR', 'name' => 'Dirección General', 'level' => 'Dirección', 'parent_code' => null],
                ['code' => 'GER_PROD', 'name' => 'Gerencia de Producción', 'level' => 'Gerencia', 'parent_code' => 'DIR'],
                ['code' => 'COORD_HSEQ', 'name' => 'Coordinación HSEQ', 'level' => 'Coordinación', 'parent_code' => 'GER_PROD'],
                ['code' => 'COORD_LOG', 'name' => 'Coordinación de Logística', 'level' => 'Coordinación', 'parent_code' => 'GER_PROD'],
            ],
        ],
        // EcoTrata (GESTOR, tax_id 900234567-2): estructura de un gestor de
        // tratamiento de residuos.
        'ECOTRATA' => [
            'tax_id' => '900234567-2',
            'areas' => [
                ['code' => 'DIR', 'name' => 'Dirección General', 'level' => 'Dirección', 'parent_code' => null],
                ['code' => 'GER_TRAT', 'name' => 'Gerencia de Tratamiento', 'level' => 'Gerencia', 'parent_code' => 'DIR'],
                ['code' => 'COORD_OPS', 'name' => 'Coordinación de Operaciones', 'level' => 'Coordinación', 'parent_code' => 'GER_TRAT'],
                ['code' => 'COORD_CAL', 'name' => 'Coordinación de Calidad', 'level' => 'Coordinación', 'parent_code' => 'GER_TRAT'],
            ],
        ],
        // LogVerde (SUBGESTOR, tax_id 900345678-3): estructura de un
        // subgestor/transportador.
        'LOGVERDE' => [
            'tax_id' => '900345678-3',
            'areas' => [
                ['code' => 'DIR', 'name' => 'Dirección General', 'level' => 'Dirección', 'parent_code' => null],
                ['code' => 'GER_LOG', 'name' => 'Gerencia de Logística', 'level' => 'Gerencia', 'parent_code' => 'DIR'],
                ['code' => 'COORD_FLOTA', 'name' => 'Coordinación de Flota', 'level' => 'Coordinación', 'parent_code' => 'GER_LOG'],
                ['code' => 'COORD_TRANS', 'name' => 'Coordinación de Transporte', 'level' => 'Coordinación', 'parent_code' => 'GER_LOG'],
            ],
        ],
    ];

    public function run(): void
    {
        foreach (self::AREAS_BY_ORGANIZATION as $entry) {
            $organization = Organization::query()->where('tax_id', $entry['tax_id'])->first();

            if (! $organization) {
                continue;
            }

            /** @var array<string, int> $areaIdsByCode */
            $areaIdsByCode = [];

            foreach ($entry['areas'] as $areaData) {
                $parentAreaId = $areaData['parent_code'] !== null
                    ? ($areaIdsByCode[$areaData['parent_code']] ?? null)
                    : null;

                $area = OrganizationalArea::query()->firstOrCreate(
                    ['organization_id' => $organization->id, 'code' => $areaData['code']],
                    [
                        'name' => $areaData['name'],
                        'level' => $areaData['level'],
                        'parent_area_id' => $parentAreaId,
                        'is_active' => true,
                    ],
                );

                $areaIdsByCode[$areaData['code']] = $area->id;
            }
        }
    }
}
