<?php

namespace Database\Seeders;

use App\Models\VehicleType;
use Illuminate\Database\Seeder;

/**
 * ============================================================================
 * AVISO -- DATOS PROVISIONALES, SIN FUENTE DE NEGOCIO CONFIRMADA
 * ============================================================================
 * Catálogo de 4 Tipos de Vehículo. Igual que `PackagingConditionSeeder`,
 * este catálogo NO tiene ningún archivo fuente ni regla de negocio (RN-XXX)
 * detrás -- el usuario confirmó explícitamente sembrarlo con los valores de
 * ejemplo del mockup de Figma (frame `881:11199`): Camión/Tractocamión/
 * Furgón/Cisterna. El mock mostraba columnas adicionales (capacidad, RESPEL,
 * líquidos) SIN fuente de dato real -- NO se agregan aquí, solo `category`
 * (texto libre) queda como campo declarado explícitamente en este lote, sin
 * valor sembrado (NULL) por no tener tampoco fuente confirmada de
 * categorías. Todo este catálogo (estructura y datos) está PENDIENTE DE
 * VALIDACIÓN REAL antes de considerarse definitivo -- mismo criterio de
 * aviso que `BranchTypeSeeder.php` usa para sus flags de capacidad.
 *
 * IMPORTANTE: tabla de referencia AISLADA -- NO toca `vehicles.vehicle_type`
 * (esquema-bd), el módulo Vehículos no está construido todavía.
 * ============================================================================
 */
class VehicleTypeSeeder extends Seeder
{
    public function run(): void
    {
        $vehicleTypes = [
            ['code' => 'CAM', 'name' => 'Camión'],
            ['code' => 'TRACTO', 'name' => 'Tractocamión'],
            ['code' => 'FURGON', 'name' => 'Furgón'],
            ['code' => 'CISTERNA', 'name' => 'Cisterna'],
        ];

        foreach ($vehicleTypes as $vehicleType) {
            VehicleType::query()->updateOrCreate(
                ['code' => $vehicleType['code']],
                [
                    'name' => $vehicleType['name'],
                    'category' => null,
                    'is_system' => true,
                    'is_active' => true,
                ],
            );
        }
    }
}
