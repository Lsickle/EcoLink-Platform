<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd (item 17/D-WF-02): conecta waste_treatment_approvals al motor
// de Workflow genérico -- technical_status/commercial_status (VARCHAR
// hardcodeado) pasan a technical_status_id/commercial_status_id FK
// respel_statuses.id, consumidos por WasteTreatmentApprovalController vía
// Workflow::resolveFor()/WorkflowTransition (ver su docblock).
//
// Migración de datos (mismo mapeo 1:1 documentado en RespelStatusSeeder,
// sin inventar equivalencias nuevas): cada código corto YA en uso hoy
// (PENDING/APPROVED/RESTRICTED/REJECTED para el eje técnico; DRAFT/QUOTED/
// NEGOTIATING/APPROVED/REJECTED/CANCELLED para el comercial) se traduce al
// código prefijado sembrado por RespelStatusSeeder (TECH_*/COM_*) -- basta
// con anteponer el prefijo, ambos catálogos usan los mismos nombres base.
//
// Las columnas nacen NULLABLE únicamente para permitir el backfill dentro
// de esta misma migración; se fuerzan a NOT NULL al final. IMPORTANTE (ver
// resumen de la tarea): esta migración asume que `respel_statuses` YA está
// poblada (RespelStatusSeeder) antes de correr -- confirmado contra la BD de
// desarrollo real (11 filas ya sembradas por el lote anterior). Si se
// aplicara esta migración contra un entorno donde el catálogo aún no se
// sembró, el backfill dejaría NULLs y el SET NOT NULL fallaría --
// intencional: preferible un error explícito en migración a silenciar datos
// huérfanos.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('waste_treatment_approvals', function (Blueprint $table) {
            $table->foreignId('technical_status_id')->nullable()->after('technical_status')
                ->constrained('respel_statuses')->restrictOnDelete();
            $table->foreignId('commercial_status_id')->nullable()->after('commercial_status')
                ->constrained('respel_statuses')->restrictOnDelete();
        });

        DB::statement(<<<'SQL'
            UPDATE waste_treatment_approvals wta
            SET technical_status_id = rs.id
            FROM respel_statuses rs
            WHERE rs.code = CONCAT('TECH_', wta.technical_status)
        SQL);

        DB::statement(<<<'SQL'
            UPDATE waste_treatment_approvals wta
            SET commercial_status_id = rs.id
            FROM respel_statuses rs
            WHERE rs.code = CONCAT('COM_', wta.commercial_status)
        SQL);

        DB::statement('ALTER TABLE waste_treatment_approvals ALTER COLUMN technical_status_id SET NOT NULL');
        DB::statement('ALTER TABLE waste_treatment_approvals ALTER COLUMN commercial_status_id SET NOT NULL');
    }

    public function down(): void
    {
        Schema::table('waste_treatment_approvals', function (Blueprint $table) {
            $table->dropConstrainedForeignId('technical_status_id');
            $table->dropConstrainedForeignId('commercial_status_id');
        });
    }
};
