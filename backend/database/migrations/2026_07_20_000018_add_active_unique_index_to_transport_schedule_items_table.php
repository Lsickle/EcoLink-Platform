<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// Hallazgo Medio (revisión de seguridad Programación/Dispatch, 2026-07-19):
// `TransportScheduleController::itemAlreadyScheduled()` evalúa "¿ya está
// cubierto por otra transport_schedule ACTIVA y no-final?" con una simple
// SELECT ejecutada ANTES de abrir la transacción de store() -- sin ningún
// constraint de base de datos que respalde esa invariante, dos requests
// concurrentes (o, de forma más directa y determinística, un único payload
// con el mismo `waste_service_request_item_id` repetido dos veces en
// `items`) pueden programar el mismo ítem dos veces.
//
// Índice único PARCIAL de Postgres -- mismo patrón exacto que
// `organizations_single_platform_tenant`
// (add_unique_single_platform_tenant_index_to_organizations_table): cubre
// solo las filas `is_active = true`, así que los N registros históricos
// `is_active = false` (ítems de programaciones ya CANCELADAS/FINALIZADAS)
// no compiten por unicidad entre sí.
//
// Esta constraint asume que `transport_schedule_items.is_active` se apaga
// cuando la `transport_schedule` dueña alcanza un estado FINAL
// (`transport_statuses.is_final = true`, hoy CANC/FIN) -- ver el cambio
// correspondiente en `TransportScheduleWorkflowService::transition()`, que
// ahora cascada ese apagado. Sin ese cambio, esta constraint bloquearía
// incorrectamente el caso ya cubierto por el test "store permite
// re-programar un ítem cuya programación previa fue CANCELADA".
return new class extends Migration
{
    public function up(): void
    {
        DB::statement(
            'CREATE UNIQUE INDEX transport_schedule_items_active_unique '.
            'ON transport_schedule_items (waste_service_request_item_id) '.
            'WHERE is_active = true AND deleted_at IS NULL'
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS transport_schedule_items_active_unique');
    }
};
