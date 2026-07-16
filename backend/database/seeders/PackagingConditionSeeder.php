<?php

namespace Database\Seeders;

use App\Models\PackagingCondition;
use Illuminate\Database\Seeder;

/**
 * ============================================================================
 * AVISO -- DATOS PROVISIONALES, SIN FUENTE DE NEGOCIO CONFIRMADA
 * ============================================================================
 * Catálogo de 3 Estados del Embalaje. A diferencia de `PackagingTypeSeeder`
 * (datos reales), este catálogo NO tiene ningún archivo fuente ni regla de
 * negocio (RN-XXX) detrás -- el usuario confirmó explícitamente sembrarlo
 * con los valores de ejemplo del mockup de Figma (frame `877:10997`):
 * Bueno/Regular/Deteriorado. `risk_level` (1/5/9) es una INFERENCIA propia
 * de este lote (mismo rango 1-9 que `hazard_characteristics`, "mayor =
 * más peligroso"), NO un valor confirmado por negocio. Todo este catálogo
 * (estructura y datos) está PENDIENTE DE VALIDACIÓN REAL antes de
 * considerarse definitivo -- mismo criterio de aviso que
 * `BranchTypeSeeder.php` usa para sus flags de capacidad.
 * ============================================================================
 */
class PackagingConditionSeeder extends Seeder
{
    public function run(): void
    {
        $packagingConditions = [
            ['code' => 'BUENO', 'name' => 'Bueno', 'risk_level' => 1],
            ['code' => 'REGULAR', 'name' => 'Regular', 'risk_level' => 5],
            ['code' => 'DETERIORADO', 'name' => 'Deteriorado', 'risk_level' => 9],
        ];

        foreach ($packagingConditions as $packagingCondition) {
            PackagingCondition::query()->updateOrCreate(
                ['code' => $packagingCondition['code']],
                [
                    'name' => $packagingCondition['name'],
                    'risk_level' => $packagingCondition['risk_level'],
                    'is_system' => true,
                    'is_active' => true,
                ],
            );
        }
    }
}
