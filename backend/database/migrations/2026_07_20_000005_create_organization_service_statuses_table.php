<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd (D-S02): organization_service_statuses -- pivote de activación
// que permite a una organización Gestor activar/agregar sus propios
// `service_statuses` personalizados, mismo patrón exacto que
// `organization_business_roles` (esta migración replica su estructura:
// organization_id/target_id/is_active/activated_by/activated_at).
//
// Sin `deleted_at` -- mismo hallazgo Alto de especialista-seguridad
// documentado en `create_organization_business_roles_table`/
// `OrganizationBusinessRole`: `BelongsToMany::wherePivot()` no aplica
// automáticamente el global scope de SoftDeletes de un pivote personalizado,
// así que un soft-delete no revocaría realmente la activación. El único
// mecanismo de revocación soportado es `is_active=false`.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('organization_service_statuses', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('service_status_id')->constrained('service_statuses')->cascadeOnDelete();
            $table->foreignId('activated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampTz('activated_at')->useCurrent();
            $table->boolean('is_active')->default(true);
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();

            $table->unique(['organization_id', 'service_status_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('organization_service_statuses');
    }
};
