<?php

namespace Database\Seeders;

use App\Models\PhysicalState;
use Illuminate\Database\Seeder;

/**
 * Catálogo de 16 Estados Físicos -- ver
 * `database/seeders/data_physical_states.json` (id/name ya limpios,
 * esquema-bd item 14(b)/L-41). `code` = versión corta sin tildes en
 * mayúscula, mapeado por `id` porque el JSON no trae `code`.
 */
class PhysicalStateSeeder extends Seeder
{
    private const CODES = [
        1 => 'SOLIDO',
        2 => 'LIQUIDO',
        3 => 'GASEOSO',
        4 => 'SEMISOLIDO',
        5 => 'LODO',
        6 => 'PASTA',
        7 => 'GEL',
        8 => 'AEROSOL',
        9 => 'MEZCLA_SOLIDO_LIQUIDO',
        10 => 'MEZCLA_LIQUIDO_LODO',
        11 => 'POLVO',
        12 => 'GRANULADO',
        13 => 'CENIZA',
        14 => 'EMULSION',
        15 => 'SUSPENSION',
        16 => 'NO_DETERMINADO',
    ];

    public function run(): void
    {
        $rows = json_decode(file_get_contents(database_path('seeders/data_physical_states.json')), true);

        foreach ($rows as $row) {
            $id = $row['id'];

            if (! isset(self::CODES[$id])) {
                throw new \LogicException("Estado físico id={$id} sin code mapeado en PhysicalStateSeeder.");
            }

            PhysicalState::query()->updateOrCreate(
                ['code' => self::CODES[$id]],
                [
                    'name' => $row['name'],
                    'is_system' => true,
                    'is_active' => true,
                ],
            );
        }
    }
}
