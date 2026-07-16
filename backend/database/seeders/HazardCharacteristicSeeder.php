<?php

namespace Database\Seeders;

use App\Models\HazardCharacteristic;
use Illuminate\Database\Seeder;

/**
 * Catálogo de 9 Características de Peligrosidad -- ver
 * `database/seeders/data_hazard_characteristics.json` (solo `name`, ya
 * limpio). `risk_level` confirmado por el usuario (esquema-bd item 14,
 * D-R04 revisado 2026-07-05, mayor = más peligroso). `code`: esquema propio
 * de este lote (Batch 2/3), primeras letras del nombre en mayúscula,
 * ajustado a mano donde había riesgo de colisión (INFLAMABLE=INF vs.
 * INFECCIOSO=INFEC) -- sin fuente confirmada de códigos cortos, señalado en
 * el resumen entregado al hilo principal.
 */
class HazardCharacteristicSeeder extends Seeder
{
    private const CODES = [
        'CORROSIVO' => 'COR',
        'INFLAMABLE' => 'INF',
        'TOXICO' => 'TOX',
        'EXPLOSIVO' => 'EXP',
        'REACTIVO' => 'REA',
        'INFECCIOSO' => 'INFEC',
        'RADIOACTIVO' => 'RAD',
        'ECOTOXICO' => 'ECO',
        'IRRITANTE' => 'IRR',
    ];

    private const RISK_LEVELS = [
        'RADIOACTIVO' => 9,
        'EXPLOSIVO' => 9,
        'TOXICO' => 7,
        'INFECCIOSO' => 7,
        'CORROSIVO' => 5,
        'REACTIVO' => 5,
        'INFLAMABLE' => 3,
        'ECOTOXICO' => 3,
        'IRRITANTE' => 1,
    ];

    public function run(): void
    {
        $rows = json_decode(file_get_contents(database_path('seeders/data_hazard_characteristics.json')), true);

        foreach ($rows as $row) {
            $name = $row['name'];

            if (! isset(self::CODES[$name], self::RISK_LEVELS[$name])) {
                throw new \LogicException("Característica de peligrosidad '{$name}' sin code/risk_level mapeado en HazardCharacteristicSeeder.");
            }

            HazardCharacteristic::query()->updateOrCreate(
                ['code' => self::CODES[$name]],
                [
                    'name' => $name,
                    'risk_level' => self::RISK_LEVELS[$name],
                    'is_system' => true,
                    'is_active' => true,
                ],
            );
        }
    }
}
