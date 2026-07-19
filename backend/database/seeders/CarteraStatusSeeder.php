<?php

namespace Database\Seeders;

use App\Models\CarteraStatus;
use Illuminate\Database\Seeder;

/**
 * Catálogo "cartera_statuses" (D-S04, lookup para
 * `organization_cartera_statuses`) -- 6 filas, CONFIRMADAS EN VIVO contra
 * Figma ("Gestión de Estados de Cartera", `07-especialista-ux.md` §3):
 * "AL DÍA / POR VENCER / VENCIDA / EN COBRO / JURÍDICO / CASTIGADA ...
 * Detalle de bloqueo por estado: AL DÍA/POR VENCER no bloquean nada;
 * VENCIDA bloquea certificados pero NO solicitudes; EN COBRO/JURÍDICO/
 * CASTIGADA bloquean certificados Y solicitudes."
 *
 * `blocks_new_requests` es la ÚNICA columna de bloqueo modelada en este
 * lote (coincide con "Bloq. Sol." del frame) -- el bloqueo de certificados
 * ("Bloq. Cert.") no aplica a este módulo y no se modela aquí.
 */
class CarteraStatusSeeder extends Seeder
{
    /**
     * code => [name, blocks_new_requests]
     */
    private const STATUSES = [
        'AL_DIA' => ['Al Día', false],
        'POR_VENCER' => ['Por Vencer', false],
        'VENCIDA' => ['Vencida', false],
        'EN_COBRO' => ['En Cobro', true],
        'JURIDICO' => ['Jurídico', true],
        'CASTIGADA' => ['Castigada', true],
    ];

    public function run(): void
    {
        foreach (self::STATUSES as $code => [$name, $blocksNewRequests]) {
            CarteraStatus::query()->updateOrCreate(
                ['code' => $code],
                [
                    'name' => $name,
                    'blocks_new_requests' => $blocksNewRequests,
                    'is_system' => true,
                    'is_active' => true,
                ],
            );
        }
    }
}
