<?php

namespace Database\Seeders;

use App\Models\Country;
use App\Models\Department;
use Illuminate\Database\Seeder;

/**
 * Catálogo Maestro "Departamentos" (Batch 1/3 de Catálogos Maestros,
 * 2026-07-15) -- 33 filas reales desde `database/seeders/data_departments.json`,
 * todas bajo Colombia (D-P01). Reemplaza el subconjunto de prueba anterior
 * (Antioquia/Cundinamarca/Valle del Cauca/Bogotá D.C., sembrado por el
 * extinto `GeographySeeder`).
 *
 * `id` de la fuente (1-33) es un identificador secuencial del archivo, NO un
 * código DANE real -- no hay código DANE real disponible para departamento
 * en esta fuente (confirmado explícitamente por el hilo principal, no
 * inventado): `dane_code` queda `NULL` para las 33 filas. `MunicipalitySeeder`
 * reconstruye el mapa id_fuente->Department::id consultando por `name`
 * (único dentro de Colombia en este dataset, verificado).
 */
class DepartmentSeeder extends Seeder
{
    public function run(): void
    {
        $colombia = Country::query()->where('iso_code', 'CO')->firstOrFail();

        $rows = json_decode(file_get_contents(database_path('seeders/data_departments.json')), true);

        foreach ($rows as $row) {
            Department::query()->updateOrCreate(
                ['country_id' => $colombia->id, 'name' => $row['name']],
                ['dane_code' => null, 'is_active' => true],
            );
        }
    }
}
