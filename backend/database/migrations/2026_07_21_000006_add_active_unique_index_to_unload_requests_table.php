<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// Hallazgo Medio (revisión de seguridad "Cita de Recepción en Planta
// bilateral", 2026-07-19): `UnloadRequestAutomationService::createFromConfirmedSchedule()`
// usaba un chequeo check-then-act (SELECT ... exists() seguido de un
// INSERT, sin constraint de BD) para evitar crear una `unload_requests`
// duplicada para la misma `transport_schedule_id`. Dos confirmaciones
// concurrentes de la MISMA `TransportSchedule` (doble clic, reintento de
// red) podían generar dos `unload_requests` para la misma programación --
// documentos duplicados con valor de trazabilidad regulatoria.
//
// Mismo patrón EXACTO que `manifest_loads_active_unique`
// (`add_active_unique_index_to_manifest_loads_table`) -- índice único
// PARCIAL de Postgres -- con una diferencia: aquí NO se condiciona por
// `is_active` (a diferencia de `manifest_loads`/`transport_schedule_items`,
// `unload_requests` no tiene ningún flujo que apague `is_active` a `false`
// para "liberar" el `transport_schedule_id` -- una `transport_schedule`
// solo se confirma una vez, así que no existe un caso legítimo de reemplazo
// que deba quedar habilitado). `WHERE deleted_at IS NULL` es suficiente: un
// `transport_schedule_id` NULL (creación manual "anticipada", D-RCP) no
// entra en conflicto entre sí -- semántica estándar de NULL en índices
// únicos de Postgres (NULL <> NULL).
return new class extends Migration
{
    public function up(): void
    {
        DB::statement(
            'CREATE UNIQUE INDEX unload_requests_active_unique '.
            'ON unload_requests (transport_schedule_id) '.
            'WHERE deleted_at IS NULL'
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS unload_requests_active_unique');
    }
};
