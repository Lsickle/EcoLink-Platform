<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd: organizational_areas -- NO documentada en el DDL de esquema-bd
// (gap explícito, plan aprobado del hilo principal previo a construir el
// módulo Organizaciones/Sedes). Entidad jerárquica scoped por organización,
// mismo patrón auto-referencial que Organization::parent()/children()
// (parent_organization_id). Sin `tenant_organization_id`: es una entidad
// propia de UNA organización, no un catálogo global multi-tenant.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('organizational_areas', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->string('code');
            $table->string('name');
            $table->foreignId('parent_area_id')->nullable()->constrained('organizational_areas')->nullOnDelete();
            $table->string('level'); // Dirección / Gerencia / Coordinación
            $table->foreignId('responsible_person_id')->nullable()->constrained('people')->nullOnDelete();
            $table->boolean('is_active')->default(true);
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();

            $table->unique(['organization_id', 'code']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('organizational_areas');
    }
};
