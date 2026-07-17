<?php

namespace Database\Seeders;

use App\Models\Treatment;
use Illuminate\Database\Seeder;

/**
 * Catálogo GLOBAL "Tratamientos" (Módulo Tratamiento, RN-063/D-R02,
 * 2026-07-17) -- 15 tipos de tratamiento ambiental REALES.
 *
 * AVISO EXPLÍCITO: esta lista es investigación propia (Decreto 4741/2005 y
 * su compilación en el Decreto 1076 de 2015, categorías RUA/IDEAM, y
 * descripciones de servicios reales de gestores colombianos como
 * Ecoentorno/Dragon/Planeta SAS) CONTRASTADA Y CONFIRMADA con el usuario del
 * proyecto -- NO es una tabla oficial única citada literalmente de ninguna
 * norma. Si el negocio la ajusta después (agrega/quita/renombra un
 * tratamiento), es el mecanismo normal de este CRUD (TreatmentController),
 * no requiere reabrir este seeder salvo para los 15 valores base.
 *
 * Todos con `is_system=true`, `tenant_organization_id=NULL` (catálogo
 * global), `parent_treatment_id=NULL` (no se usa en este lote).
 */
class TreatmentSeeder extends Seeder
{
    public function run(): void
    {
        $treatments = [
            [
                'code' => 'INCINERACION', 'name' => 'Incineración', 'treatment_type' => 'THERMAL',
                'allows_recovery' => false, 'requires_environmental_license' => true, 'requires_certificate' => true,
                'risk_level' => 'HIGH', 'min_temperature' => 900, 'max_temperature' => 1200,
            ],
            [
                'code' => 'COPROCESAMIENTO', 'name' => 'Coprocesamiento en Hornos Cementeros', 'treatment_type' => 'THERMAL',
                'allows_recovery' => true, 'requires_environmental_license' => true, 'requires_certificate' => true,
                'risk_level' => 'HIGH', 'min_temperature' => 1200, 'max_temperature' => 1500,
            ],
            [
                'code' => 'TRATAMIENTO_TERMICO_SIN_COMBUSTION', 'name' => 'Tratamiento Térmico sin Combustión (Autoclave/Esterilización)', 'treatment_type' => 'THERMAL',
                'allows_recovery' => false, 'requires_environmental_license' => true, 'requires_certificate' => true,
                'risk_level' => 'MEDIUM', 'min_temperature' => 121, 'max_temperature' => 134,
            ],
            [
                'code' => 'DESACTIVACION_ALTA_EFICIENCIA', 'name' => 'Desactivación de Alta Eficiencia', 'treatment_type' => 'CHEMICAL',
                'allows_recovery' => false, 'requires_environmental_license' => true, 'requires_certificate' => true,
                'risk_level' => 'MEDIUM',
            ],
            [
                'code' => 'DESACTIVACION_BAJA_EFICIENCIA', 'name' => 'Desactivación de Baja Eficiencia', 'treatment_type' => 'CHEMICAL',
                'allows_recovery' => false, 'requires_environmental_license' => true, 'requires_certificate' => true,
                'risk_level' => 'MEDIUM',
            ],
            [
                'code' => 'TRATAMIENTO_FISICOQUIMICO', 'name' => 'Tratamiento Fisicoquímico', 'treatment_type' => 'PHYSICOCHEMICAL',
                'allows_recovery' => false, 'requires_environmental_license' => true, 'requires_certificate' => true,
                'risk_level' => 'MEDIUM',
            ],
            [
                'code' => 'TRATAMIENTO_AGUAS_RESIDUALES', 'name' => 'Tratamiento de Aguas Residuales y Lixiviados Industriales', 'treatment_type' => 'LIQUID',
                'allows_recovery' => false, 'requires_environmental_license' => true, 'requires_certificate' => true,
                'risk_level' => 'MEDIUM',
            ],
            [
                'code' => 'TRATAMIENTO_LODOS', 'name' => 'Tratamiento y Deshidratación de Lodos', 'treatment_type' => 'SLUDGE',
                'allows_recovery' => false, 'requires_environmental_license' => true, 'requires_certificate' => true,
                'risk_level' => 'MEDIUM',
            ],
            [
                'code' => 'ESTABILIZACION_ENCAPSULAMIENTO', 'name' => 'Estabilización, Solidificación y Encapsulamiento', 'treatment_type' => 'STABILIZATION',
                'allows_recovery' => false, 'requires_environmental_license' => true, 'requires_certificate' => true,
                'risk_level' => 'MEDIUM',
            ],
            [
                'code' => 'RELLENO_SEGURIDAD', 'name' => 'Celda de Seguridad (Relleno de Seguridad / Confinamiento Técnico)', 'treatment_type' => 'DISPOSAL',
                'allows_recovery' => false, 'requires_environmental_license' => true, 'requires_certificate' => true,
                'risk_level' => 'HIGH',
            ],
            [
                'code' => 'TRATAMIENTO_BIOLOGICO', 'name' => 'Tratamiento Biológico (Biodegradación/Landfarming)', 'treatment_type' => 'BIOLOGICAL',
                'allows_recovery' => false, 'requires_environmental_license' => true, 'requires_certificate' => true,
                'risk_level' => 'MEDIUM',
            ],
            [
                'code' => 'COMPOSTAJE', 'name' => 'Compostaje', 'treatment_type' => 'BIOLOGICAL',
                'allows_recovery' => true, 'requires_environmental_license' => false, 'requires_certificate' => true,
                'risk_level' => 'LOW',
            ],
            [
                'code' => 'RECUPERACION_ACEITES', 'name' => 'Recuperación y Regeneración de Aceites Usados', 'treatment_type' => 'RECOVERY',
                'allows_recovery' => true, 'requires_environmental_license' => true, 'requires_certificate' => true,
                'risk_level' => 'MEDIUM',
            ],
            [
                'code' => 'RECICLAJE_APROVECHAMIENTO', 'name' => 'Reciclaje y Aprovechamiento de Materiales', 'treatment_type' => 'RECOVERY',
                'allows_recovery' => true, 'requires_environmental_license' => false, 'requires_certificate' => true,
                'risk_level' => 'LOW',
            ],
            [
                'code' => 'TRATAMIENTO_FISICO', 'name' => 'Tratamiento Físico (Trituración/Compactación/Separación)', 'treatment_type' => 'PHYSICAL',
                'allows_recovery' => false, 'requires_environmental_license' => false, 'requires_certificate' => false,
                'risk_level' => 'LOW',
            ],
        ];

        foreach ($treatments as $treatment) {
            Treatment::query()->updateOrCreate(
                ['code' => $treatment['code']],
                [
                    'tenant_organization_id' => null,
                    'name' => $treatment['name'],
                    'treatment_type' => $treatment['treatment_type'],
                    'parent_treatment_id' => null,
                    'requires_environmental_license' => $treatment['requires_environmental_license'],
                    'requires_special_transport' => false,
                    'allows_recovery' => $treatment['allows_recovery'],
                    'requires_certificate' => $treatment['requires_certificate'],
                    'requires_weight_control' => true,
                    'min_temperature' => $treatment['min_temperature'] ?? null,
                    'max_temperature' => $treatment['max_temperature'] ?? null,
                    'temperature_unit' => 'C',
                    'risk_level' => $treatment['risk_level'],
                    'is_system' => true,
                    'is_active' => true,
                ],
            );
        }
    }
}
