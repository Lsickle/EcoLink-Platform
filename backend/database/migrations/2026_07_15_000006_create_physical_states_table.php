<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd, item 14(b) (L-41, normalización de campos varchar a catálogo
// FK, patrón business_roles/positions): catálogo global "Estado Físico",
// compartido entre `waste_streams.physical_state` y `wastes.physical_state`
// (ambas columnas migran a physical_state_id FK en un lote futuro, fuera de
// alcance aquí). 100% global, sin tenant_organization_id.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('physical_states', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->string('code')->unique();
            $table->string('name')->unique();
            $table->boolean('is_system')->default(true);
            $table->boolean('is_active')->default(true);
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('physical_states');
    }
};
