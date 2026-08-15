<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Fase 2 del ciclo de vida del residuo (confirmado por el usuario,
// 2026-08-15): distingue al Gestor que OPERA dentro de EcoLink del Gestor DE
// REFERENCIA, que maneja todo en su propia plataforma y no tiene usuarios aqui.
//
// Vive en `organization_business_roles`, NO en `organizations` (decision del
// usuario): la distincion es sobre la CAPACIDAD de tratar residuos, no sobre la
// organizacion entera. Una organizacion Generador+Gestor puede operar dentro de
// EcoLink como Generador y ser "de referencia" en su faceta de Gestor -- con la
// marca a nivel de organizacion ese caso quedaba ambiguo.
//
// Solo se lee para roles de negocio con `can_treat_waste = true`; para
// GENERADOR/TRANSPORTADOR la columna no significa nada (se documenta aqui en vez
// de imponer un CHECK, que obligaria a conocer el catalogo desde el esquema).
//
// DEFAULT true a proposito: todo lo ya sembrado son Gestores que operan dentro
// de la plataforma, y esa sigue siendo la via normal. "De referencia" es la
// excepcion que alguien debe marcar explicitamente.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('organization_business_roles', function (Blueprint $table) {
            $table->boolean('operates_in_platform')->default(true)->after('is_primary_role');
        });
    }

    public function down(): void
    {
        Schema::table('organization_business_roles', function (Blueprint $table) {
            $table->dropColumn('operates_in_platform');
        });
    }
};
