<?php

namespace Database\Seeders;

use App\Models\WasteCategory;
use Illuminate\Database\Seeder;

/**
 * Catálogo de 8 Categorías de Residuo -- ver
 * `database/seeders/data_waste_categories.json` (id/name/description ya
 * limpios, esquema-bd item 14, D-R05). `code` = nombre normalizado en
 * mayúscula/snake_case, mapeado por `id` porque el JSON no trae `code`.
 */
class WasteCategorySeeder extends Seeder
{
    private const CODES = [
        1 => 'INDUSTRIAL',
        2 => 'HOSPITALARIO_Y_SIMILARES',
        3 => 'APROVECHABLE',
        4 => 'ORGANICO',
        5 => 'POSCONSUMO',
        6 => 'RCD',
        7 => 'ESPECIAL',
        8 => 'ORDINARIO',
    ];

    public function run(): void
    {
        $rows = json_decode(file_get_contents(database_path('seeders/data_waste_categories.json')), true);

        foreach ($rows as $row) {
            $id = $row['id'];

            if (! isset(self::CODES[$id])) {
                throw new \LogicException("Categoría de residuo id={$id} sin code mapeado en WasteCategorySeeder.");
            }

            WasteCategory::query()->updateOrCreate(
                ['code' => self::CODES[$id]],
                [
                    'name' => $row['name'],
                    'description' => $row['description'],
                    'is_system' => true,
                    'is_active' => true,
                ],
            );
        }
    }
}
