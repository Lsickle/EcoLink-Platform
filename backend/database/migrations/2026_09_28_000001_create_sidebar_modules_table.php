<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd (2026-09-28): sidebar_modules. Catálogo de los 7 grupos
// temáticos en los que se reorganizó el sidebar del frontend (Organización/
// Residuos/Servicios/Logística/Operaciones/Certificados/Administración),
// habilitables por ORGANIZACIÓN INDIVIDUAL (ver organization_sidebar_modules),
// a diferencia de business_roles (habilitado por TIPO de organización). Mismo
// patrón de catálogo simple que business_roles/roles/permissions.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sidebar_modules', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->string('code', 50)->unique();
            $table->string('name', 150)->unique();
            $table->integer('sort_order')->default(1);
            $table->boolean('is_active')->default(true);
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sidebar_modules');
    }
};
