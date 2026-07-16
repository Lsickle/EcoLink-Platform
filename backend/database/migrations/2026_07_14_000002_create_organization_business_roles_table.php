<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd: organization_business_roles (pivote N:N Organization<->
// BusinessRole). El diseño completo de esquema-bd agrega campos de
// licenciamiento (license_number, issuing_authority, valid_from/until,
// requires_renewal, etc.) -- deliberadamente FUERA de este lote: no hay
// módulo operativo (Residuos/Transporte) todavía que los consuma, y
// modelarlos ahora sin un caso de uso real que los valide arriesga
// inventar estructura. Mismo patrón de pivote que role_permissions/
// user_roles.
//
// Sin `deleted_at` (hallazgo Alto, especialista-seguridad 2026-07-14):
// BelongsToMany::wherePivot() no respeta el global scope de SoftDeletes de
// un pivote personalizado -- ver el AVISO en OrganizationBusinessRole. El
// único mecanismo de revocación es `is_active`, igual que `assigned_by` usa
// `restrictOnDelete()` (no `nullOnDelete()`) para quedar alineado al patrón
// de `role_permissions.assigned_by`/`user_roles.assigned_by` del eje 1.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('organization_business_roles', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('business_role_id')->constrained('business_roles')->restrictOnDelete();
            $table->foreignId('assigned_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestampTz('assigned_at')->useCurrent();
            $table->boolean('is_active')->default(true);
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();

            $table->unique(['organization_id', 'business_role_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('organization_business_roles');
    }
};
