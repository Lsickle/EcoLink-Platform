<?php

namespace Database\Seeders;

use App\Models\UnCode;
use Illuminate\Database\Seeder;

/**
 * Catálogo de Códigos ONU de transporte de mercancías peligrosas -- 65 filas
 * ya limpias en `database/seeders/data_un_codes.json`. `hazard_class`/
 * `packing_group` quedan vacíos en el seed (la fuente curada no trae ese
 * dato).
 */
class UnCodeSeeder extends Seeder
{
    public function run(): void
    {
        $rows = json_decode(file_get_contents(database_path('seeders/data_un_codes.json')), true);

        foreach ($rows as $row) {
            UnCode::query()->updateOrCreate(
                ['code' => $row['code']],
                [
                    'name' => $row['name'],
                    'is_system' => true,
                    'is_active' => true,
                ],
            );
        }
    }
}
