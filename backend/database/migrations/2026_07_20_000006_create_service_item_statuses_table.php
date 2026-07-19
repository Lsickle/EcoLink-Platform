<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd (D-S10): service_item_statuses -- catálogo SEPARADO de
// `service_statuses` (cabecera). Representa la VIABILIDAD DE RECOLECCIÓN de
// un ítem individual de una solicitud (ej. "este residuo sí se recoge, este
// otro no, por condiciones de almacenamiento") -- concepto distinto tanto de
// `waste_treatment_approvals` (aprobación de TRATAMIENTO por Gestor) como de
// `wastes.status` (declaración del residuo) o `service_statuses` (estado de
// la cabecera de la solicitud). Confirmado por el usuario en
// `03-decisiones-validacion-arquitecto-datos.md` (D-S10): "item_status
// necesita su propio catálogo separado ... un concepto distinto tanto del
// flujo de aprobación de tratamiento ... como del estado de declaración ...
// o de la cabecera de la solicitud".
//
// Catálogo GLOBAL simple (id/uuid/code/name/is_system/is_active), SIN
// `organization_id` -- si este catálogo también debe seguir el patrón de
// personalización por Gestor (D-S02/D-R05) quedó EXPLÍCITAMENTE pendiente,
// no confirmado (issue S-37, `09-plan-migracion.md`: "decisión humana
// pendiente sobre patrón de service_item_statuses" / "No — diseño aún
// abierto"). Se construye aquí solo la forma más simple y seguible sin
// inventar el pivote de activación (`organization_service_item_statuses`);
// si el negocio confirma después la personalización por Gestor, se agrega
// esa tabla + `organization_id` en una migración posterior, sin deshacer
// esta.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('service_item_statuses', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->string('code', 50)->unique();
            $table->string('name', 120);
            $table->text('description')->nullable();
            $table->boolean('is_system')->default(true);
            $table->boolean('is_active')->default(true);
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('service_item_statuses');
    }
};
