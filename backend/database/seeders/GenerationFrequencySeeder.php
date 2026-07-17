<?php

namespace Database\Seeders;

use App\Models\GenerationFrequency;
use Illuminate\Database\Seeder;

/**
 * Catálogo de 4 Frecuencias de Generación -- seed real confirmado (Módulo
 * Residuos, núcleo): DAILY/WEEKLY/MONTHLY/OCCASIONAL.
 */
class GenerationFrequencySeeder extends Seeder
{
    private const VALUES = [
        ['code' => 'DAILY', 'name' => 'Diaria'],
        ['code' => 'WEEKLY', 'name' => 'Semanal'],
        ['code' => 'MONTHLY', 'name' => 'Mensual'],
        ['code' => 'OCCASIONAL', 'name' => 'Ocasional'],
    ];

    public function run(): void
    {
        foreach (self::VALUES as $value) {
            GenerationFrequency::query()->updateOrCreate(
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
