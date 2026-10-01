<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Reconexión del calendario de programación de servicios
// (`TransportScheduleCalendarScreen.tsx`, prototipo de solo interfaz nunca
// conectado al backend real): su modal de asignación pide Conductor/
// Auxiliar/Vehículo, pero el campo "Auxiliar" nunca tuvo columna real en
// `transport_schedules` -- solo existía `transport_personnel_id` (el
// conductor). El usuario confirmó explícitamente agregar la columna real
// ahora, para cerrar ese hueco de interfaz-sin-respaldo.
//
// Referencia a la MISMA tabla `transport_personnel` que el conductor: esa
// tabla es genérica (conductor y auxiliar son ambos, conceptualmente,
// "personal de transporte" -- no hay distinción de rol en la tabla), no una
// entidad separada.
//
// NULLABLE (a diferencia de `transport_personnel_id`, NOT NULL): esta es una
// decisión de alcance SEÑALADA explícitamente, no asumida en silencio -- no
// hay ninguna RN (regla de negocio) que confirme que el auxiliar sea
// obligatorio en toda programación de transporte, a diferencia del conductor
// (RN-091/RN-097/RN-098 sí exigen conductor asignado en toda ruta, ver
// docblock de `create_transport_schedules_table`). Se deja opcional hasta que
// el negocio confirme lo contrario.
//
// `restrictOnDelete()`: mismo criterio que el FK hermano
// `transport_personnel_id` -- no permitir borrar personal de transporte que
// esté referenciado por una programación (conductor o auxiliar).
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('transport_schedules', function (Blueprint $table) {
            $table->foreignId('assistant_personnel_id')
                ->nullable()
                ->after('transport_personnel_id')
                ->constrained('transport_personnel')
                ->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('transport_schedules', function (Blueprint $table) {
            $table->dropConstrainedForeignId('assistant_personnel_id');
        });
    }
};
