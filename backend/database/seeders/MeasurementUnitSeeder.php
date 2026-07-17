<?php

namespace Database\Seeders;

use App\Models\MeasurementUnit;
use Illuminate\Database\Seeder;

/**
 * Catálogo de 5 Unidades de Medida -- seed real confirmado (Módulo Residuos,
 * núcleo): KG/TON/LT/M3/LB.
 */
class MeasurementUnitSeeder extends Seeder
{
    private const VALUES = [
        ['code' => 'KG', 'name' => 'Kilogramo'],
        ['code' => 'TON', 'name' => 'Tonelada'],
        ['code' => 'LT', 'name' => 'Litro'],
        ['code' => 'M3', 'name' => 'Metro Cúbico'],
        ['code' => 'LB', 'name' => 'Libra'],
    ];

    public function run(): void
    {
        foreach (self::VALUES as $value) {
            MeasurementUnit::query()->updateOrCreate(
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
