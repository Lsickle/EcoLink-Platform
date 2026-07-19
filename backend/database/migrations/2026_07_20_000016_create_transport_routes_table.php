<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Módulo Programación Logística (CU-059 "Agrupar por Zona/Ruta", CU-060
// "Optimizar Rutas" -- post-MVP, ver 00-inventario.md §1): agrupación
// simple de varias `transport_schedules` bajo una ruta ("Ruta_1"/"Ruta_2"
// en Figma), SIN motor de optimización real -- alcance mínimo viable
// confirmado en el plan de esta tarea. El orden de parada vive en la tabla
// puente `transport_route_stops` (ver esa migración).
//
// Tabla NUEVA, sin precedente directo en esquema-bd (el borrador de
// esquema-bd solo documenta el hallazgo "sin soporte de rutas/mapas" como
// gap, sin proponer DDL) -- diseño de esta tarea, siguiendo el mismo patrón
// de columnas ya establecido para agregados de negocio simples de este
// módulo (`transport_schedules`).
//
// `organization_id`: organización que arma/coordina la ruta (Gestor/
// Subgestor en Modalidad 1, o Generador+TRANSPORTER en Modalidad 2) --
// mismo criterio que `transport_schedules.organization_id`.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('transport_routes', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('tenant_organization_id')->nullable()->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('organization_id')->constrained('organizations')->restrictOnDelete();
            $table->string('route_code', 50)->unique();
            $table->string('name', 150);
            $table->date('route_date')->nullable();
            $table->text('observations')->nullable();
            $table->boolean('is_active')->default(true);
            $table->jsonb('metadata')->nullable()->default(DB::raw("'{}'::jsonb"));
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transport_routes');
    }
};
