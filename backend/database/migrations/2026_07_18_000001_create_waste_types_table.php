<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd: waste_types -- catálogo global "Tipo de Residuo"
// (OPERATIONAL/COMMON/TEMPLATE/PREAPPROVED/TEMPORARY, L-41). Mismo patrón
// EXACTO que `waste_categories`/`physical_states`/`branch_types` -- sin
// tenant_organization_id, catálogo 100% global gestionado solo por
// ADMINISTRADOR.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('waste_types', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->string('code')->unique();
            $table->string('name');
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
        Schema::dropIfExists('waste_types');
    }
};
