<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Batch 1/3 de Catálogos Maestros (2026-07-15): la migración original de
// `departments` (2026_07_14_000004) declaró `dane_code` NOT NULL asumiendo
// que siempre habría un código DANE de 2 dígitos disponible -- correcto
// para el subconjunto de prueba del extinto GeographySeeder, pero el
// dataset real de 33 departamentos (`data_departments.json`) NO trae código
// DANE de departamento en la fuente (confirmado explícitamente por el hilo
// principal, no inventado). Se relaja a NULL-able -- bug de dato real, no
// una reinterpretación de negocio (mismo criterio que el gap #1 de
// `esquema-bd`, corrección técnica directa).
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('departments', function (Blueprint $table) {
            $table->string('dane_code')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('departments', function (Blueprint $table) {
            $table->string('dane_code')->nullable(false)->change();
        });
    }
};
