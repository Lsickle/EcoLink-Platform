<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd: treatments -- catálogo GLOBAL de tipos de tratamiento
// ambiental (Incineración, Coprocesamiento, Celda de Seguridad, etc.).
// Gestionado EXCLUSIVAMENTE por el staff de la organización plataforma
// (EcoLink) -- mismo gate binario `isPlatformStaff()` ya usado en
// `OrganizationController`/`BusinessRoleController` para create/update/
// activate/deactivate; la LECTURA sí está disponible para cualquier
// usuario autenticado con `treatments.read` (los Gestores lo necesitan
// para configurar sus `branch_treatments`).
//
// `parent_treatment_id` se incluye tal como documenta esquema-bd
// (auto-referencia RESTRICT) pero NO se usa en este lote -- confirmado
// explícitamente por el usuario, queda siempre NULL.
//
// `is_system` con DEFAULT true (desviación deliberada del borrador de
// esquema-bd, que documenta DEFAULT false): confirmado explícitamente por
// el usuario -- "todos los sembrados nacen true" para este catálogo en
// particular. Los tratamientos creados vía API por platform staff nacen
// `is_system=false` (mismo criterio que WasteStream/VehicleType), el
// DEFAULT de columna solo protege inserciones fuera de ese camino (p. ej.
// seeders futuros).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('treatments', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('tenant_organization_id')->nullable()->constrained('organizations')->nullOnDelete();
            $table->string('code', 50)->unique();
            $table->string('name', 255);
            $table->text('description')->nullable();
            $table->string('treatment_type', 50)->default('DISPOSAL');
            $table->foreignId('parent_treatment_id')->nullable()->constrained('treatments')->restrictOnDelete();
            $table->boolean('requires_environmental_license')->default(true);
            $table->boolean('requires_special_transport')->default(false);
            $table->boolean('allows_recovery')->default(false);
            $table->boolean('requires_certificate')->default(true);
            $table->boolean('requires_weight_control')->default(true);
            $table->decimal('min_temperature', 8, 2)->nullable();
            $table->decimal('max_temperature', 8, 2)->nullable();
            $table->string('temperature_unit', 10)->default('C');
            $table->string('risk_level', 20)->default('MEDIUM');
            $table->decimal('estimated_processing_time_hours', 8, 2)->nullable();
            $table->boolean('is_system')->default(true);
            $table->boolean('is_active')->default(true);
            $table->jsonb('metadata')->nullable()->default(DB::raw("'{}'::jsonb"));
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('treatments');
    }
};
