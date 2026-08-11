<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Cambio de esquema confirmado por el usuario (2026-08-09): `branches.operational_capacity`
 * (un solo valor numérico, sin unidad explícita) se reemplaza por 3 columnas nulables, una
 * por unidad -- `operational_capacity_kg` / `operational_capacity_liters` /
 * `operational_capacity_m3`, todas DECIMAL(12,2) NULL sin default. El default `0` anterior
 * se retira a propósito: bajo el modelo nuevo "sin valor" es NULL genuino (capacidad no
 * declarada), no cero (capacidad declarada como nula).
 *
 * Migración de datos (decisión del usuario, documentada aquí por no haber registro de a qué
 * unidad correspondía el valor histórico): de las 11 sucursales existentes en dev, solo 1
 * (id=10) tenía `operational_capacity` con valor distinto de NULL/0 (`1.00`). Ese único valor
 * se migra a `operational_capacity_kg` -- KG es la unidad por defecto ya usada en el resto del
 * esquema (ver `vehicles.capacity_unit DEFAULT KG`, `branch_locations.capacity_unit DEFAULT
 * KG`, `branch_treatments.capacity_unit DEFAULT KG`).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('branches', function (Blueprint $table) {
            $table->decimal('operational_capacity_kg', 12, 2)->nullable()->after('operational_capacity');
            $table->decimal('operational_capacity_liters', 12, 2)->nullable()->after('operational_capacity_kg');
            $table->decimal('operational_capacity_m3', 12, 2)->nullable()->after('operational_capacity_liters');
        });

        // Migra el único valor histórico distinto de NULL/0 a la columna KG (ver docblock).
        DB::table('branches')
            ->whereNotNull('operational_capacity')
            ->where('operational_capacity', '!=', 0)
            ->update(['operational_capacity_kg' => DB::raw('operational_capacity')]);

        Schema::table('branches', function (Blueprint $table) {
            $table->dropColumn('operational_capacity');
        });
    }

    public function down(): void
    {
        Schema::table('branches', function (Blueprint $table) {
            $table->decimal('operational_capacity', 10, 2)->nullable()->default(0)->after('license_expiration_date');
        });

        // Caso raro de rollback con datos: si una fila llegó a tener más de una de las 3
        // unidades pobladas (posible tras el split, aunque el flujo normal de la app solo
        // llene una), se toma el MAYOR de los 3 valores como mejor esfuerzo -- no hay forma
        // de reconstruir la unidad original una vez colapsadas a un solo campo sin unidad.
        DB::statement(<<<'SQL'
            UPDATE branches
            SET operational_capacity = GREATEST(
                COALESCE(operational_capacity_kg, 0),
                COALESCE(operational_capacity_liters, 0),
                COALESCE(operational_capacity_m3, 0)
            )
            WHERE operational_capacity_kg IS NOT NULL
               OR operational_capacity_liters IS NOT NULL
               OR operational_capacity_m3 IS NOT NULL
        SQL);

        Schema::table('branches', function (Blueprint $table) {
            $table->dropColumn(['operational_capacity_kg', 'operational_capacity_liters', 'operational_capacity_m3']);
        });
    }
};
