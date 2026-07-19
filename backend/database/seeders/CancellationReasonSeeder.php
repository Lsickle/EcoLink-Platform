<?php

namespace Database\Seeders;

use App\Models\CancellationReason;
use Illuminate\Database\Seeder;

/**
 * Catálogo "cancellation_reasons" (D-S09). Siembra SOLO la fila `OTHER`
 * ("Otra razón", `is_other=true`) -- la única confirmada como
 * estructuralmente necesaria por el propio enunciado de D-S09 ("con opción
 * 'Otra razón' + texto libre").
 *
 * El resto del catálogo (motivos de negocio concretos, ej. equivalentes a
 * RN-MC-001..005 de CU-016.3) NO tiene seed confirmado todavía: D-S09 dice
 * textualmente "Diseño de columnas exacto y seed inicial pendiente de una
 * vuelta detallada de arquitecto-datos sobre esta tabla específica (no
 * bloqueante)", y `09-plan-migracion.md` lo repite sin resolver (issue
 * S-36). No se inventan aquí -- ver resumen de la tarea.
 */
class CancellationReasonSeeder extends Seeder
{
    public function run(): void
    {
        CancellationReason::query()->updateOrCreate(
            ['organization_id' => null, 'code' => 'OTHER'],
            [
                'name' => 'Otra razón',
                'is_other' => true,
                'is_system' => true,
                'is_active' => true,
            ],
        );
    }
}
