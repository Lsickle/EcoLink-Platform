<?php

namespace Database\Seeders;

use App\Models\ServiceItemStatus;
use Illuminate\Database\Seeder;

/**
 * Catálogo "service_item_statuses" (D-S10) -- viabilidad de recolección de
 * un ítem individual de una solicitud (distinto de `service_statuses` de
 * cabecera y de `waste_treatment_approvals`).
 *
 * Seed EXACTO citado textualmente en `03-decisiones-validacion-arquitecto-datos.md`
 * (D-S10): "el vocabulario es distinto (Pendiente/Aceptado/Rechazado a
 * nivel de ítem, vs. Borrador/Enviada/Aprobada/etc. a nivel de cabecera)".
 */
class ServiceItemStatusSeeder extends Seeder
{
    private const STATUSES = [
        'PENDING' => 'Pendiente',
        'ACCEPTED' => 'Aceptado',
        'REJECTED' => 'Rechazado',
    ];

    public function run(): void
    {
        foreach (self::STATUSES as $code => $name) {
            ServiceItemStatus::query()->updateOrCreate(
                ['code' => $code],
                [
                    'name' => $name,
                    'is_system' => true,
                    'is_active' => true,
                ],
            );
        }
    }
}
