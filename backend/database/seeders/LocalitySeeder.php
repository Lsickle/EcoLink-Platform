<?php

namespace Database\Seeders;

use App\Models\Locality;
use App\Models\Municipality;
use Illuminate\Database\Seeder;

/**
 * Catálogo Maestro "Localidades" (Batch 1/3 de Catálogos Maestros,
 * 2026-07-15) -- 20 filas reales desde `database/seeders/data_localities.json`,
 * TODAS bajo el municipio Bogotá D.C. (única ciudad colombiana dividida en
 * localidades, ver docblock del modelo `Locality`). Reemplaza el
 * subconjunto de prueba anterior (2 localidades, Usaquén/Chapinero,
 * sembrado por el extinto `GeographySeeder`).
 *
 * El municipio Bogotá D.C. se resuelve por `codigo_dane='11001'` (código
 * DANE nacional único, más robusto que buscar por nombre/tildes) --
 * requiere que `MunicipalitySeeder` haya corrido antes.
 */
class LocalitySeeder extends Seeder
{
    public function run(): void
    {
        $bogota = Municipality::query()->where('codigo_dane', '11001')->firstOrFail();

        $rows = json_decode(file_get_contents(database_path('seeders/data_localities.json')), true);

        foreach ($rows as $row) {
            Locality::query()->updateOrCreate(
                ['municipality_id' => $bogota->id, 'code' => (string) $row['codigo']],
                ['name' => $row['name'], 'is_active' => true],
            );
        }
    }
}
