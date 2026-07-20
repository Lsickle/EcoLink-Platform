<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// Hallazgo Medio (revisión de seguridad Manifiesto de Cargue, 2026-07-19):
// `ManifestLoadController::store()` no tenía ninguna restricción que
// impidiera crear MÁS DE UN `manifest_load` para el mismo
// `transport_schedule_id` -- un manifiesto es un documento legal RESPEL, así
// que dos manifiestos activos para el mismo transporte real es un riesgo de
// doble registro/doble facturación, no un bug cosmético.
//
// Mismo patrón EXACTO que
// `add_active_unique_index_to_transport_schedule_items_table` (índice único
// PARCIAL de Postgres, cubre solo `is_active = true AND deleted_at IS NULL`)
// -- con una diferencia: `manifest_loads` YA tenía columna `is_active`
// (creada junto con la tabla, `create_manifest_loads_table`, sin usarse
// todavía para este propósito) en vez de necesitar agregarla. Se elige
// apagarla a `false` únicamente al llegar a `CANCELLED`
// (`ManifestLoadWorkflowService::transition()`) -- NO al llegar a cualquier
// estado final genérico como hace `TransportScheduleWorkflowService` con
// `transport_schedule_items.is_active` (CANC/FIN indistintamente): la regla
// de negocio de esta tarea es más angosta -- solo un manifiesto CANCELADO
// habilita un reemplazo para la misma programación; un manifiesto que llegue
// a `Closed` (ciclo de vida diferido a `manifest_unloads`, Fase 5) NO debe
// liberar el `transport_schedule_id` para un segundo manifiesto.
return new class extends Migration
{
    public function up(): void
    {
        DB::statement(
            'CREATE UNIQUE INDEX manifest_loads_active_unique '.
            'ON manifest_loads (transport_schedule_id) '.
            'WHERE is_active = true AND deleted_at IS NULL'
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS manifest_loads_active_unique');
    }
};
