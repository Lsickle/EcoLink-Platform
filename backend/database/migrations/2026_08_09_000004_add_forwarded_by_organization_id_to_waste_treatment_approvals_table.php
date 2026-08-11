<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Cadena Generador -> Subgestor -> Gestor (ver docblock de
// create_generator_subgestor_relationships_table). NULL (default, todas las
// filas existentes) = solicitud de evaluación creada DIRECTAMENTE por el
// dueño del residuo (comportamiento actual, sin cambios). No-NULL = la
// organización SUBGESTOR que reenvió la solicitud en nombre del Generador
// dueño del residuo (`waste_treatment_approvals.organization_id` sigue
// siendo SIEMPRE el Gestor evaluador, sin cambios -- esta columna nueva solo
// registra el intermediario del lado del residuo, no reemplaza ninguna FK
// existente).
//
// Consumida por WasteTreatmentApprovalController::show()/index()/
// indexForWaste() para el ocultamiento condicional de identidad del
// Generador frente al Gestor evaluador (ver su docblock) -- el dato de
// `waste.organization_id` NUNCA se borra ni se anonimiza en base de datos,
// solo se omite de la respuesta JSON cuando aplica (trazabilidad
// regulatoria RESPEL intacta).
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('waste_treatment_approvals', function (Blueprint $table) {
            $table->foreignId('forwarded_by_organization_id')->nullable()->after('waste_id')
                ->constrained('organizations')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('waste_treatment_approvals', function (Blueprint $table) {
            $table->dropConstrainedForeignId('forwarded_by_organization_id');
        });
    }
};
