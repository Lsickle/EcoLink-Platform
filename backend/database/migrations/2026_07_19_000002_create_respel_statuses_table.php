<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd (skill esquema-bd, líneas 1336-1361, item 17/D-WF-02): catálogo
// de estados del eje técnico/comercial de `waste_treatment_approvals`
// (`respel_statuses`). Columnas EXACTAS del DDL del skill.
//
// Decisión de diseño documentada (NO una desviación silenciosa -- el DDL no
// aclara este punto y no hay spec previa que lo resuelva): `tenant_organization_id`
// es NOT NULL en el DDL (no admite catálogo global con NULL, a diferencia de
// `treatments`/`waste_streams`). Se puebla con la organización PLATAFORMA
// (mismo patrón que `PlatformOrganizationSeeder::PLATFORM_TAX_ID`) para que
// el VOCABULARIO de estados sea un catálogo BASE compartido por todas las
// organizaciones -- personalizar un workflow (motor D-WF-01) cambia las
// TRANSICIONES/ROLES/REGLAS que usan esos códigos, nunca el vocabulario de
// estados en sí. Si una organización necesitara vocabulario propio en el
// futuro, se sembraría como filas adicionales con su propio
// tenant_organization_id -- no soportado en este lote (no confirmado por
// negocio).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('respel_statuses', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('tenant_organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->string('code', 50);
            $table->string('name', 100);
            $table->text('description')->nullable();
            $table->integer('sort_order')->default(1);
            $table->boolean('is_initial')->default(false);
            $table->boolean('is_final')->default(false);
            $table->boolean('is_approved_status')->default(false);
            $table->boolean('is_rejected_status')->default(false);
            $table->boolean('requires_commercial_review')->default(false);
            $table->boolean('requires_environmental_review')->default(false);
            $table->boolean('allows_service_request')->default(false);
            $table->boolean('requires_additional_information')->default(false);
            $table->string('color_hex', 7)->nullable();
            $table->string('icon', 100)->nullable();
            $table->boolean('is_active')->default(true);
            $table->jsonb('metadata')->nullable()->default(DB::raw("'{}'::jsonb"));
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();

            // No documentado como UNIQUE en el DDL del skill, pero necesario
            // en la práctica: dos filas con el mismo `code` bajo el mismo
            // tenant (la organización PLATAFORMA) romperían la resolución
            // determinística de `from_status_code`/`to_status_code` en
            // `workflow_transitions`.
            $table->unique(['tenant_organization_id', 'code']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('respel_statuses');
    }
};
