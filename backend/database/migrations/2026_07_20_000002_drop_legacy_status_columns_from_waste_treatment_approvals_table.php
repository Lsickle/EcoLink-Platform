<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// esquema-bd (item 17/D-WF-02): retira las columnas VARCHAR legacy una vez
// `technical_status_id`/`commercial_status_id` (migración anterior) están
// pobladas y TODO el código (modelo, controller, policy, seeders demo,
// tests) fue actualizado para depender de los accessors virtuales
// `WasteTreatmentApproval::technical_status`/`commercial_status` (que
// traducen transparentemente desde/hacia el FK, ver docblock del modelo) en
// vez de la columna cruda -- ningún consumidor debería seguir
// leyendo/escribiendo la columna VARCHAR directamente a esta altura.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('waste_treatment_approvals', function (Blueprint $table) {
            $table->dropColumn(['technical_status', 'commercial_status']);
        });
    }

    public function down(): void
    {
        Schema::table('waste_treatment_approvals', function (Blueprint $table) {
            $table->string('commercial_status', 30)->default('DRAFT');
            $table->string('technical_status', 30)->default('PENDING');
        });
    }
};
