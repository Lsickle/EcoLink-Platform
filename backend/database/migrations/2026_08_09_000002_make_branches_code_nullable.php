<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * esquema-bd (branches, ~línea 356): `code VARCHAR(50) NULL` -- unicidad
 * COMPUESTA con `organization_id` (RN-BRA-004 / T-04), no global. La
 * migración original `2026_07_14_000009_create_branches_table` declaró la
 * columna sin `->nullable()`, desviación real del diseño (no una decisión
 * de negocio pendiente) -- nunca aplicó el `NULL` documentado. Confirmado
 * además porque el usuario pidió explícitamente que "Código" sea opcional
 * en el formulario de Crear Sucursal.
 *
 * El índice único parcial ya vigente (`2026_07_15_233500_...`, `CREATE
 * UNIQUE INDEX ... ON branches (organization_id, code) WHERE deleted_at IS
 * NULL`) no se ve afectado: Postgres permite múltiples NULL en un índice
 * único sin que colisionen entre sí (NULL <> NULL), así que dos sedes sin
 * `code` en la misma organización coexisten sin conflicto.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('branches', function (Blueprint $table) {
            $table->string('code')->nullable()->change();
        });
    }

    /**
     * Rollback: si ya existen filas con `code IS NULL` (esperable tras
     * aplicar esta migración -- es justamente el caso que habilita), este
     * `down()` FALLARÁ al reimponer `NOT NULL` (violación de constraint en
     * Postgres). Es un rollback destructivo por naturaleza -- revertir esta
     * migración exige primero poblar o eliminar esas filas manualmente. Se
     * documenta como comportamiento aceptado, no se intenta backfill
     * automático de `code` (no hay valor por defecto razonable que inventar).
     */
    public function down(): void
    {
        Schema::table('branches', function (Blueprint $table) {
            $table->string('code')->nullable(false)->change();
        });
    }
};
