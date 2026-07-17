<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd: waste_treatment_approvals -- "Evaluación del Gestor". El
// mecanismo de invitación es simple: el Generador (dueño de `waste_id`)
// elige un `branch_treatment_id` de un Gestor (organización con
// business_role GESTOR, can_treat_waste=true) y crea la solicitud -- esa
// elección ES la invitación. `organization_id` de ESTA tabla es SIEMPRE el
// GESTOR dueño de `branch_treatment_id`, NUNCA el dueño del residuo (que
// puede ser cualquier otra organización) -- acceso cruzado controlado, ver
// WasteTreatmentApproval::isAccessibleBy()/WasteTreatmentApprovalPolicy.
//
// `waste_id` con ON DELETE RESTRICT (esquema-bd punto 14, confirmado por el
// usuario 2026-07-05: corrige el CASCADE original, en conflicto con
// RN-048/RN-049 -- consistente con `branch_treatment_id`, ya RESTRICT).
//
// `technical_status`/`commercial_status` quedan como VARCHAR (no FK a
// `respel_statuses`, D-WF-02) -- esa migración es una propuesta "pendiente
// de aplicarse a diccionario.csv", no confirmada en código todavía en
// ningún otro punto del proyecto; se sigue la definición literal de
// esquema-bd/la tarea de este lote.
//
// `detailed_notes` (CU-012.10, L-36): campo de texto libre simple -- NO se
// construye el CMS de descripciones homologadas que las specs originales
// sobre-diseñaron (`descriptions`/`description_versions`/`description_templates`).
//
// Sin `created_by`/`updated_by` -- confirmado contra esquema-bd: esta tabla
// NO los define (a diferencia de `branch_treatments`/`wastes`).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('waste_treatment_approvals', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('tenant_organization_id')->nullable()->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('waste_id')->constrained('wastes')->restrictOnDelete();
            $table->foreignId('branch_treatment_id')->constrained('branch_treatments')->restrictOnDelete();
            $table->integer('version')->default(1);
            // DRAFT / QUOTED / APPROVED / REJECTED / NEGOTIATING / CANCELLED
            $table->string('commercial_status', 30)->default('DRAFT');
            // PENDING / APPROVED / REJECTED / RESTRICTED
            $table->string('technical_status', 30)->default('PENDING');
            $table->decimal('unit_price', 14, 2)->nullable();
            $table->string('currency', 10)->default('COP');
            $table->string('billing_unit', 20)->default('KG');
            $table->decimal('minimum_quantity', 14, 2)->nullable();
            $table->decimal('maximum_quantity', 14, 2)->nullable();
            $table->boolean('requires_lab_analysis')->default(false);
            $table->boolean('requires_sds')->default(false);
            $table->text('restrictions')->nullable();
            $table->text('commercial_notes')->nullable();
            $table->text('technical_notes')->nullable();
            $table->timestampTz('technical_approved_at')->nullable();
            $table->foreignId('technical_approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampTz('commercial_approved_at')->nullable();
            $table->foreignId('commercial_approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->date('valid_from')->nullable();
            $table->date('valid_until')->nullable();
            // CU-012.10, L-36.
            $table->text('detailed_notes')->nullable();
            $table->boolean('is_active')->default(true);
            $table->jsonb('metadata')->nullable()->default(DB::raw("'{}'::jsonb"));
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('waste_treatment_approvals');
    }
};
