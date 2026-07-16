<?php

namespace Database\Seeders;

use App\Models\Country;
use App\Models\Department;
use App\Models\Municipality;
use Illuminate\Database\Seeder;

/**
 * Catálogo Maestro "Municipios" (Batch 1/3 de Catálogos Maestros,
 * 2026-07-15) -- 1.119 filas reales desde
 * `database/seeders/data_municipalities.json`. Reemplaza el subconjunto de
 * prueba anterior (un municipio por departamento, sembrado por el extinto
 * `GeographySeeder`).
 *
 * `departamento_id` de la fuente (1-33) referencia el `id` secuencial de
 * `data_departments.json` (verificado 100% consistente contra los 1.119
 * registros, sin huérfanos) -- se reconstruye el mapa id_fuente->
 * Department::id real consultando por `name` (mismo criterio que documenta
 * `DepartmentSeeder`, requiere que `DepartmentSeeder` haya corrido antes).
 * `codigo_municipio` SÍ es el código DANE real de 5 dígitos (string en la
 * fuente, preserva ceros a la izquierda) -- va en `municipalities.codigo_dane`.
 */
class MunicipalitySeeder extends Seeder
{
    public function run(): void
    {
        $colombia = Country::query()->where('iso_code', 'CO')->firstOrFail();

        $departmentRows = json_decode(file_get_contents(database_path('seeders/data_departments.json')), true);

        /** @var array<int, int> $sourceIdToDepartmentId */
        $sourceIdToDepartmentId = [];

        foreach ($departmentRows as $row) {
            $department = Department::query()
                ->where('country_id', $colombia->id)
                ->where('name', $row['name'])
                ->firstOrFail();

            $sourceIdToDepartmentId[$row['id']] = $department->id;
        }

        $municipalityRows = json_decode(file_get_contents(database_path('seeders/data_municipalities.json')), true);

        foreach ($municipalityRows as $row) {
            $departmentId = $sourceIdToDepartmentId[$row['departamento_id']];

            Municipality::query()->updateOrCreate(
                ['department_id' => $departmentId, 'codigo_dane' => (string) $row['codigo_municipio']],
                ['name' => $row['nombre'], 'is_active' => true],
            );
        }
    }
}
