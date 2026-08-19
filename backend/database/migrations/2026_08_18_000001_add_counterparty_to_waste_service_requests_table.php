<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Destinatario de la solicitud de servicio (2026-08-18).
 *
 * La tabla nació SIN ninguna columna de destinatario, y a propósito: la
 * decisión `D-S01` permitía dirigir una misma solicitud a VARIOS Gestores a la
 * vez (el caso "un camión recoge varios residuos, cada uno a un Gestor
 * especializado"), así que el destinatario se deducía de los tratamientos de
 * los ítems y no había uno solo que persistir.
 *
 * `D-S01` queda REEMPLAZADA por decisión del usuario (2026-08-18): una
 * solicitud tiene UN SOLO destinatario. Con varios no hay a quién notificar ni
 * quién es dueño del siguiente paso (la programación de recolección), y
 * permitía mezclar en un mismo documento residuos de Gestores que compiten
 * entre sí.
 *
 * Son DOS columnas porque la contraparte comercial y quien finalmente trata el
 * residuo no siempre son la misma organización:
 *
 * - `counterparty_organization_id` -- con quién tiene la relación comercial el
 *   Generador. Es a quién se le notifica y quién gestiona la solicitud. Puede
 *   ser un Gestor (vía directa) o un SUBGESTOR (cuando intermedió).
 * - `gestor_organization_id` -- quién finalmente trata. Igual a la contraparte
 *   en la vía directa; distinto cuando hay Subgestor de por medio, incluido el
 *   caso del Gestor DE REFERENCIA que no opera dentro de EcoLink.
 *
 * NULLABLE en base de datos solo por las filas que ya existen; en validación
 * son OBLIGATORIAS desde `ServiceRequestController::store()`. No se rellenan
 * hacia atrás a propósito: el destinatario de una solicitud vieja tendría que
 * inferirse de sus ítems, y esa inferencia es justamente lo que se está
 * retirando -- inventarla aquí dejaría un dato que nadie decidió.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('waste_service_requests', function (Blueprint $table) {
            $table->foreignId('counterparty_organization_id')->nullable()->after('organization_id')
                ->constrained('organizations')->restrictOnDelete();
            $table->foreignId('gestor_organization_id')->nullable()->after('counterparty_organization_id')
                ->constrained('organizations')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('waste_service_requests', function (Blueprint $table) {
            $table->dropConstrainedForeignId('gestor_organization_id');
            $table->dropConstrainedForeignId('counterparty_organization_id');
        });
    }
};
