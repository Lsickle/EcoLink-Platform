<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Corrección del modelo de negocio (confirmada por el usuario, 2026-08-13):
// las "características especiales" NO las diligencia el Generador al declarar
// el residuo -- las marca el GESTOR cuando evalúa el residuo para asignarle un
// tratamiento, porque son exigencias de ESE tratamiento concreto, no
// propiedades intrínsecas del residuo.
//
// `waste_treatment_approvals` ya tenía las dos primeras (`requires_lab_analysis`
// y `requires_sds`, ya editables por el Gestor en la pantalla de evaluación);
// aquí se completan las dos que faltaban para cubrir el bloque entero que se
// retira del Paso 2 del wizard de declaración.
//
// Las columnas homónimas de `wastes` NO se eliminan: conservan lo declarado
// históricamente y las siguen usando los Residuos Preaprobados (que también
// crea el Gestor, ver PreapprovedWasteController). Lo que cambia es que el
// endpoint de declaración deja de aceptarlas -- ver
// WasteController::validationRules().
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('waste_treatment_approvals', function (Blueprint $table) {
            $table->boolean('requires_special_transport')->default(false)->after('requires_sds');
            $table->boolean('requires_special_ppe')->default(false)->after('requires_special_transport');
        });
    }

    public function down(): void
    {
        Schema::table('waste_treatment_approvals', function (Blueprint $table) {
            $table->dropColumn(['requires_special_transport', 'requires_special_ppe']);
        });
    }
};
