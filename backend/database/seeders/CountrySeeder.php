<?php

namespace Database\Seeders;

use App\Models\Country;
use Illuminate\Database\Seeder;

/**
 * Catálogo Maestro "Países" (ISO 3166-1 alpha-2) -- 246 filas reales desde
 * `database/seeders/data_countries.json` (Batch 1/3 de Catálogos Maestros,
 * 2026-07-15). Reemplaza el subconjunto de prueba anterior (un único país
 * "Colombia", sembrado por el extinto `GeographySeeder`). Todas
 * `is_active=true` -- catálogo de referencia global, no exclusivo de
 * Colombia (D-P01); `Colombia` (iso_code='CO') está incluida en el archivo
 * fuente como una fila más, no requiere tratamiento especial en este
 * seeder (`DepartmentSeeder` la resuelve explícitamente por `iso_code`).
 */
class CountrySeeder extends Seeder
{
    public function run(): void
    {
        $rows = json_decode(file_get_contents(database_path('seeders/data_countries.json')), true);

        foreach ($rows as $row) {
            Country::query()->updateOrCreate(
                ['iso_code' => $row['iso_code']],
                ['name' => $row['name'], 'is_active' => true],
            );
        }
    }
}
