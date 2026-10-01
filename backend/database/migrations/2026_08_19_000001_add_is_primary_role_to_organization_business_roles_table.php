<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd (DDL aspiracional): organization_business_roles.is_primary_role
// -- ya documentada en el skill esquema-bd, pero NUNCA aplicada a la
// migración real `create_organization_business_roles_table` (gap confirmado
// por el usuario, 2026-09-28). La migración
// `add_operates_in_platform_to_organization_business_roles_table` ya asumía
// su existencia (`->after('is_primary_role')`) sin que la columna existiera
// -- inofensivo en Postgres porque el grammar de Postgres ignora `after()`
// (solo tiene efecto en MySQL), pero es la prueba de que el gap ya se había
// notado implícitamente sin corregirse.
//
// Backfill automático (confirmado por el usuario, no opcional): toda
// organización con business_roles activos debe terminar con EXACTAMENTE uno
// marcado is_primary_role=true -- el de menor `business_roles.sort_order`
// entre sus activos. Cubre tanto el caso de un solo activo (ese queda
// marcado, por consistencia) como el de varios activos sin marcar aún
// (estado real pre-backfill). Vía query builder crudo (DB::table), no
// Eloquent, para que la migración quede estable a futuro sin depender de
// cambios en los modelos.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('organization_business_roles', function (Blueprint $table) {
            $table->boolean('is_primary_role')->default(false)->after('is_active');
        });

        $this->backfillPrimaryRoles();
    }

    public function down(): void
    {
        Schema::table('organization_business_roles', function (Blueprint $table) {
            $table->dropColumn('is_primary_role');
        });
    }

    /**
     * Por organización, el registro ganador es el business_role ACTIVO de
     * menor `sort_order` (desempate por `organization_business_roles.id`
     * ascendente, para un resultado determinístico). Se obtienen todos los
     * candidatos ya ordenados y se toma el primero de cada grupo en PHP
     * (`unique('organization_id')` conserva la primera aparición) en vez de
     * una subquery correlacionada -- más legible y suficiente para el
     * volumen de datos de este catálogo.
     */
    private function backfillPrimaryRoles(): void
    {
        $winnerIds = DB::table('organization_business_roles')
            ->join('business_roles', 'business_roles.id', '=', 'organization_business_roles.business_role_id')
            ->where('organization_business_roles.is_active', true)
            ->orderBy('organization_business_roles.organization_id')
            ->orderBy('business_roles.sort_order')
            ->orderBy('organization_business_roles.id')
            ->select([
                'organization_business_roles.id',
                'organization_business_roles.organization_id',
            ])
            ->get()
            ->unique('organization_id')
            ->pluck('id');

        if ($winnerIds->isNotEmpty()) {
            DB::table('organization_business_roles')
                ->whereIn('id', $winnerIds)
                ->update(['is_primary_role' => true]);
        }
    }
};
