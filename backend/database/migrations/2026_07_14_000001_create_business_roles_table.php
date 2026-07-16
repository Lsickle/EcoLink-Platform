<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd: business_roles (eje 2 de autorización -- "tipo de
// organización", independiente del RBAC de usuario individual del eje 1).
// El diseño completo de esquema-bd incluye `parent_business_role_id` y
// varios campos elaborados (ui_color, ui_icon, system_status) que este lote
// deliberadamente NO construye -- se mantiene al mismo nivel de simplicidad
// que `roles`/`permissions` (catálogo simple, mismo patrón de migración).
// `created_by`/`updated_by` sí se replican (hallazgo Medio, especialista-
// seguridad 2026-07-14) para quedar consistente con `roles`/`permissions`.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('business_roles', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->string('code', 50)->unique();
            $table->string('name', 150)->unique();
            $table->text('description')->nullable();
            $table->boolean('can_generate_waste')->default(false);
            $table->boolean('can_transport_waste')->default(false);
            $table->boolean('can_treat_waste')->default(false);
            $table->boolean('can_approve_treatments')->default(false);
            $table->boolean('can_issue_manifests')->default(false);
            $table->boolean('can_issue_disposal_certificates')->default(false);
            $table->boolean('requires_environmental_license')->default(false);
            $table->boolean('requires_transport_authorization')->default(false);
            $table->integer('sort_order')->default(1);
            $table->boolean('is_system')->default(true);
            $table->boolean('is_active')->default(true);
            $table->jsonb('metadata')->nullable();
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('business_roles');
    }
};
