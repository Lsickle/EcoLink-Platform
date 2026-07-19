<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd (D-S09): cancellation_reasons -- catálogo de motivos de
// cancelación de una `waste_service_request`, resolviendo RN-SOL-009/
// RN-MC-001..005 con columnas dedicadas (en vez del `metadata` JSONB usado
// hasta ahora). Mismo patrón D-R05/D-S02 (catálogo global + personalización
// por Gestor vía `organization_id` NULL/valor), más la opción "Otra razón"
// (`is_other`) que habilita el texto libre de
// `waste_service_requests.cancellation_details` en la UI.
//
// Seed real: SOLO se siembra la fila `OTHER` (`is_other=true`) --
// confirmado como estructuralmente necesaria por el propio título de D-S09
// ("con opción 'Otra razón' + texto libre"). El resto del catálogo (motivos
// de negocio concretos) NO tiene seed confirmado todavía: D-S09 dice
// textualmente "Diseño de columnas exacto y seed inicial pendiente de una
// vuelta detallada de arquitecto-datos sobre esta tabla específica (no
// bloqueante)", y `09-plan-migracion.md` lo repite como issue S-36 sin
// resolver. No se inventan motivos de negocio aquí -- ver
// CancellationReasonSeeder.
//
// `organization_service_cancellation_reasons` (pivote de activación) NO se
// construye en esta migración -- no está en la lista de migraciones
// pedidas para esta tarea (a diferencia de `organization_service_statuses`,
// que sí lo está); queda fuera de alcance de este lote.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cancellation_reasons', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('organization_id')->nullable()->constrained('organizations')->cascadeOnDelete();
            $table->string('code', 50);
            $table->string('name', 150);
            $table->boolean('is_other')->default(false);
            $table->boolean('is_system')->default(true);
            $table->boolean('is_active')->default(true);
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();
        });

        // Mismo criterio de 2 índices parciales que `service_statuses`.
        DB::statement(
            'CREATE UNIQUE INDEX cancellation_reasons_organization_id_code_unique ON cancellation_reasons (organization_id, code) WHERE organization_id IS NOT NULL AND deleted_at IS NULL'
        );
        DB::statement(
            'CREATE UNIQUE INDEX cancellation_reasons_code_unique_global ON cancellation_reasons (code) WHERE organization_id IS NULL AND deleted_at IS NULL'
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('cancellation_reasons');
    }
};
