<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Fase 2 del ciclo de vida del residuo (2026-08-15). Marca que la evaluacion la
// registro un TERCERO en nombre del Gestor: la evaluacion tecnica real ocurrio
// fuera de la plataforma, y EcoLink o el Subgestor solo esta dejando constancia
// del resultado.
//
// NO se reutiliza `forwarded_by_organization_id`, que ya existe en esta tabla:
// ese campo significa "Subgestor reenviando en nombre de un GENERADOR" (lado
// del residuo) y ademas gobierna el enmascaramiento de la organizacion
// generadora en la respuesta JSON (`maskForwardedWasteOrganization()`).
// Mezclar ambos sentidos en una sola columna romperia esa semantica.
//
// NULL = evaluacion normal, hecha por el propio Gestor dentro de EcoLink.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('waste_treatment_approvals', function (Blueprint $table) {
            $table->foreignId('delegated_by_organization_id')
                ->nullable()
                ->after('forwarded_by_organization_id')
                ->constrained('organizations')
                ->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('waste_treatment_approvals', function (Blueprint $table) {
            $table->dropForeign(['delegated_by_organization_id']);
            $table->dropColumn('delegated_by_organization_id');
        });
    }
};
