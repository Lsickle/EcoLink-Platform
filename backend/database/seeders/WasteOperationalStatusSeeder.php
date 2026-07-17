<?php

namespace Database\Seeders;

use App\Models\WasteOperationalStatus;
use Illuminate\Database\Seeder;

/**
 * Catálogo de 4 Estados Operativos de Residuo -- seed real confirmado
 * (Módulo Residuos, núcleo): ACTIVE/PENDING/SUSPENDED/ARCHIVED.
 *
 * DISTINTO de `wastes.status` (workflow de declaración) -- no confundir.
 */
class WasteOperationalStatusSeeder extends Seeder
{
    private const VALUES = [
        ['code' => 'ACTIVE', 'name' => 'Activo'],
        ['code' => 'PENDING', 'name' => 'Pendiente'],
        ['code' => 'SUSPENDED', 'name' => 'Suspendido'],
        ['code' => 'ARCHIVED', 'name' => 'Archivado'],
    ];

    public function run(): void
    {
        foreach (self::VALUES as $value) {
            WasteOperationalStatus::query()->updateOrCreate(
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
