<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd, item 14 (Módulo Residuos y Corrientes): catálogo global
// "Categoría de Residuo" (4º eje de clasificación, independiente de Y/A/UN,
// RN-190/D-R05) -- 100% global, sin tenant_organization_id/organization_id.
// La tabla pivote `organization_waste_categories` (activación por
// organización) NO se construye en este lote -- queda para cuando exista el
// módulo Residuos (ver database/seeders/WasteCategorySeeder.php).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('waste_categories', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->string('code')->unique();
            $table->string('name')->unique();
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
        Schema::dropIfExists('waste_categories');
    }
};
