<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd: wastes -- núcleo del Módulo Residuos (declaración +
// clasificación). Acceso DUAL, mismo patrón exacto que
// `branches`/`vehicles`/`branch_treatments`: platform staff gestiona TODOS
// los residuos, un admin de tenant (o usuario con `wastes.read`) solo los de
// su propia organización -- ver `Waste::isAccessibleBy()`/`WastePolicy`. SIN
// restricción de business_role (confirmado por el usuario: "cualquier rol de
// negocio puede registrar residuos").
//
// NO incluye `waste_stream_id` (FK singular) -- descartado como mecanismo de
// pertenencia (esquema-bd, punto 14): la relación residuo<->corriente es
// EXCLUSIVAMENTE N:M vía `waste_stream_assignments`/`waste_un_codes` (ver
// migraciones siguientes). Es tabla nueva, no hay datos legacy que migrar.
//
// `waste_danger` es un campo DERIVADO/CACHE (nunca aceptado del cliente,
// recalculado por `Waste::recalculateWasteDanger()`), `status` es el
// workflow de declaración (BR/DEC/REV/CLS/RCH) -- DISTINTO de
// `operational_status_id` (catálogo `waste_operational_statuses`, ver
// docblock de esa migración).
//
// `waste_type_id`/`measurement_unit_id`/`operational_status_id` son FK
// NOT NULL con "default" a nivel de APLICACIÓN (WasteController::store()
// resuelve OPERATIONAL/KG/ACTIVE por código si el cliente no los envía) --
// no hay forma de expresar un default de FK a un id dinámico a nivel de
// esquema, mismo criterio que el resto del proyecto (ver
// `branch_treatments.operational_status` para el equivalente en texto).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('wastes', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('tenant_organization_id')->nullable()->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('organization_id')->constrained('organizations')->restrictOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
            $table->foreignId('waste_category_id')->nullable()->constrained('waste_categories')->nullOnDelete();
            $table->string('code', 50)->nullable();
            $table->string('name', 255);
            $table->text('description')->nullable();
            $table->foreignId('waste_type_id')->constrained('waste_types')->restrictOnDelete();
            // Derivado/cache -- ver docblock arriba. Guarda el `code` de la
            // característica de peligrosidad de mayor `risk_level`
            // seleccionada, o NULL si no hay ninguna.
            $table->string('waste_danger', 20)->nullable();
            $table->boolean('is_template')->default(false);
            $table->boolean('is_preapproved')->default(false);
            // Se deja NULL en este lote -- lo puebla el lote de
            // preaprobación automática (fuera de alcance aquí).
            $table->foreignId('preapproved_by_organization_id')->nullable()->constrained('organizations')->nullOnDelete();
            $table->boolean('requires_characterization')->default(false);
            $table->boolean('requires_sds')->default(false);
            $table->foreignId('physical_state_id')->nullable()->constrained('physical_states')->nullOnDelete();
            $table->foreignId('measurement_unit_id')->constrained('measurement_units')->restrictOnDelete();
            $table->decimal('average_weight', 14, 2)->nullable();
            $table->foreignId('generation_frequency_id')->nullable()->constrained('generation_frequencies')->nullOnDelete();
            $table->boolean('requires_special_transport')->default(false);
            $table->boolean('requires_special_ppe')->default(false);
            $table->foreignId('operational_status_id')->constrained('waste_operational_statuses')->restrictOnDelete();
            // Workflow de declaración (RN, ver docblock de WasteController):
            // BR (Borrador) / DEC (Declarado) / REV (En Revisión) / CLS
            // (Clasificado) / RCH (Rechazado, reversible a BR). Lista cerrada
            // de texto, no catálogo FK -- endpoints dedicados, sin motor de
            // workflow configurable (confirmado por el usuario).
            $table->string('status', 20)->default('BR');
            $table->timestampTz('last_classification_review_at')->nullable();
            $table->decimal('quantity', 14, 2)->nullable();
            $table->date('generation_date')->nullable();
            // Campo "VIN/Referencia Interna" del wizard -- nombrado
            // `internal_reference` (no `vin`, error de copy-paste de otro
            // módulo en el mock original).
            $table->string('internal_reference', 100)->nullable();
            $table->text('operational_notes')->nullable();
            $table->boolean('is_active')->default(true);
            $table->jsonb('metadata')->nullable()->default(DB::raw("'{}'::jsonb"));
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
        });

        // `code` único COMPUESTO con `organization_id` (NO global, mismo
        // patrón que `branches.code`) -- índice único PARCIAL (excluye
        // soft-deletes y NULL).
        DB::statement(
            'CREATE UNIQUE INDEX wastes_organization_id_code_unique ON wastes (organization_id, code) WHERE deleted_at IS NULL AND code IS NOT NULL'
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('wastes');
    }
};
