<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd: branch_treatments -- habilitación de un `treatment` (catálogo
// global) en una SEDE concreta de un Gestor, con su propia capacidad/
// licencia. Acceso DUAL, mismo patrón exacto que `branches`/`vehicles`:
// platform staff gestiona TODAS, un admin de tenant (o usuario con
// `branch_treatments.read` sin ser platform staff) solo las de su propia
// organización -- ver `BranchTreatment::isAccessibleBy()`/
// `BranchTreatmentPolicy`.
//
// Restricción de negocio confirmada: SOLO organizaciones con
// `business_role` GESTOR (`can_treat_waste=true`) pueden tener
// `branch_treatments` -- validado en `BranchTreatmentController::store()`
// vía `Organization::hasCapability('can_treat_waste')`, NO como constraint
// de esquema (la capacidad de negocio vive en `organization_business_roles`,
// no es expresable como FK/CHECK aquí).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('branch_treatments', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('tenant_organization_id')->nullable()->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('branch_id')->constrained('branches')->cascadeOnDelete();
            $table->foreignId('treatment_id')->constrained('treatments')->restrictOnDelete();
            $table->string('internal_code', 50)->nullable();
            $table->string('operational_name', 255)->nullable();
            $table->decimal('max_capacity', 14, 2)->nullable()->default(0);
            $table->string('capacity_unit', 20)->default('KG');
            $table->decimal('daily_capacity', 14, 2)->nullable();
            $table->decimal('monthly_capacity', 14, 2)->nullable();
            $table->string('environmental_license_number', 100)->nullable();
            $table->date('valid_from')->nullable();
            $table->date('valid_until')->nullable();
            $table->boolean('requires_manual_approval')->default(false);
            $table->boolean('allows_mixed_waste')->default(false);
            $table->boolean('requires_weight_validation')->default(true);
            // Lista cerrada de texto, no catálogo FK (mismo criterio que
            // `branches.status`/`vehicles.operational_status`): ACTIVE /
            // INACTIVE / SUSPENDED.
            $table->string('operational_status', 30)->default('ACTIVE');
            $table->text('observations')->nullable();
            $table->boolean('is_active')->default(true);
            $table->jsonb('metadata')->nullable()->default(DB::raw("'{}'::jsonb"));
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
        });

        // `internal_code` único PARCIAL (excluye soft-deletes y NULL) --
        // mismo mecanismo exacto ya establecido en `vehicles.code`.
        DB::statement(
            'CREATE UNIQUE INDEX branch_treatments_internal_code_unique ON branch_treatments (internal_code) WHERE deleted_at IS NULL AND internal_code IS NOT NULL'
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('branch_treatments');
    }
};
