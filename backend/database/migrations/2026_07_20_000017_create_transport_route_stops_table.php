<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Módulo Programación Logística (CU-059/CU-060): tabla puente mínima entre
// `transport_routes` y `transport_schedules`, con orden de parada
// (`stop_sequence`) -- alcance mínimo viable, SIN motor de optimización
// real (ver docblock de `create_transport_routes_table`).
//
// `transport_schedule_id` UNIQUE: una `transport_schedule` pertenece, como
// mucho, a UNA ruta a la vez (no tiene sentido despachar el mismo viaje/
// vehículo en dos rutas físicas simultáneas) -- decisión de diseño de esta
// tarea, sin precedente/decisión D-PRG explícita; documentado aquí como tal
// en vez de asumirlo silenciosamente en el modelo.
//
// `restrictOnDelete()` en `transport_schedule_id` (a diferencia de
// `cascadeOnDelete()` en `transport_route_id`): borrar una ruta no debe
// arrastrar el borrado de las programaciones que agrupaba, solo la
// asociación; borrar una programación con parada asignada debe bloquearse
// hasta que se quite explícitamente de la ruta.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('transport_route_stops', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('tenant_organization_id')->nullable()->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('transport_route_id')->constrained('transport_routes')->cascadeOnDelete();
            $table->foreignId('transport_schedule_id')->unique()->constrained('transport_schedules')->restrictOnDelete();
            $table->integer('stop_sequence');
            $table->text('observations')->nullable();
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();

            $table->unique(['transport_route_id', 'stop_sequence']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transport_route_stops');
    }
};
