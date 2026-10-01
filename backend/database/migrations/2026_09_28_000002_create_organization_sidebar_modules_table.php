<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd (2026-09-28): organization_sidebar_modules (pivote N:N
// Organization<->SidebarModule). Sin `deleted_at` -- mismo criterio que
// organization_business_roles (ver AVISO en OrganizationBusinessRole):
// BelongsToMany::wherePivot()/withPivot() no respeta el global scope de
// SoftDeletes de un pivote personalizado, así que el único mecanismo de
// revocación soportado es `is_enabled=false`.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('organization_sidebar_modules', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('sidebar_module_id')->constrained('sidebar_modules')->restrictOnDelete();
            $table->foreignId('enabled_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestampTz('enabled_at')->useCurrent();
            $table->boolean('is_enabled')->default(true);
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();

            $table->unique(['organization_id', 'sidebar_module_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('organization_sidebar_modules');
    }
};
