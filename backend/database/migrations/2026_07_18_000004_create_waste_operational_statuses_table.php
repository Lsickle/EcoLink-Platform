<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd: waste_operational_statuses -- catálogo global "Estado
// Operativo de Residuo" (ACTIVE/PENDING/SUSPENDED/ARCHIVED). Mismo patrón
// EXACTO que `waste_categories`/`physical_states`/`branch_types`.
//
// OJO: este catálogo es DISTINTO de `wastes.status` (el workflow de
// declaración BR/DEC/REV/CLS/RCH, ver migración de `wastes`) -- ya señalado
// como tal en esquema-bd, no confundirlos.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('waste_operational_statuses', function (Blueprint $table) {
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
        Schema::dropIfExists('waste_operational_statuses');
    }
};
