<?php

namespace Database\Seeders;

use App\Models\WasteType;
use Illuminate\Database\Seeder;

/**
 * Catálogo de 5 Tipos de Residuo -- seed real confirmado (Módulo Residuos,
 * núcleo): OPERATIONAL/COMMON/TEMPLATE/PREAPPROVED/TEMPORARY.
 */
class WasteTypeSeeder extends Seeder
{
    private const VALUES = [
        ['code' => 'OPERATIONAL', 'name' => 'Operacional'],
        ['code' => 'COMMON', 'name' => 'Común'],
        ['code' => 'TEMPLATE', 'name' => 'Plantilla'],
        ['code' => 'PREAPPROVED', 'name' => 'Preaprobado'],
        ['code' => 'TEMPORARY', 'name' => 'Temporal'],
    ];

    public function run(): void
    {
        foreach (self::VALUES as $value) {
            WasteType::query()->updateOrCreate(
                ['code' => $value['code']],
                [
                    'name' => $value['name'],
                    'is_system' => true,
                    'is_active' => true,
                ],
            );
        }
    }
}
