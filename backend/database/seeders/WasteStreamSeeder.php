<?php

namespace Database\Seeders;

use App\Models\WasteStream;
use Illuminate\Database\Seeder;

/**
 * Catálogo "Corrientes de Residuos" (Y/A, Convenio de Basilea / Decreto 1076
 * de 2015) -- 179 filas ya limpias y verificadas en
 * `database/seeders/data_waste_streams.json` (no se vuelve a procesar el
 * Excel fuente aquí).
 */
class WasteStreamSeeder extends Seeder
{
    public function run(): void
    {
        $rows = json_decode(file_get_contents(database_path('seeders/data_waste_streams.json')), true);

        foreach ($rows as $row) {
            WasteStream::query()->updateOrCreate(
                ['code' => $row['code']],
                [
                    'name' => $row['name'],
                    'tipo' => $row['tipo'],
                    'is_system' => true,
                    'is_active' => true,
                ],
            );
        }
    }
}
