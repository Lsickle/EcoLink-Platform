<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd (transport_statuses) + D-PRG-08/D-PRG-11 (Módulo Programación
// Logística): catálogo de estados de `transport_schedules`, análogo a
// `service_statuses`/`respel_statuses`.
//
// `tenant_organization_id` NOT NULL (columnas EXACTAS del DDL del skill,
// mismo criterio ya aplicado en `create_respel_statuses_table`): se puebla
// con la organización PLATAFORMA (TransportStatusSeeder) -- catálogo BASE
// de vocabulario compartido. D-PRG-08 aplaza explícitamente resolver
// `is_system`/activación-por-organización (patrón D-R05) a la
// reconciliación transversal de catálogos ya prevista (D-S15) -- no se
// inventa aquí.
//
// D-PRG-11: los 9 estados nombrados de "# Workflow de Programación
// Logística.md" (Draft/PendingValidation/.../Cancelled) NO se siembran
// como vocabulario obligatorio -- ese documento queda como referencia
// semántica, no como nombres exactos forzados. El seed real (7 filas:
// BOR/PEND/PROG/CONF/EJEC/FIN/CANC) viene confirmado en vivo contra Figma
// ("Estados de Programación de Transporte", `906:11704`, ver
// `06-especialista-ux.md` Adenda) -- ver TransportStatusSeeder.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('transport_statuses', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('tenant_organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->string('code', 50);
            $table->string('name', 100);
            $table->text('description')->nullable();
            $table->integer('sort_order')->default(1);
            $table->boolean('is_initial')->default(false);
            $table->boolean('is_final')->default(false);
            $table->boolean('requires_schedule')->default(false);
            $table->boolean('requires_vehicle')->default(false);
            $table->boolean('requires_load_manifest')->default(false);
            $table->boolean('requires_unload_manifest')->default(false);
            $table->string('color_hex', 7)->nullable();
            $table->string('icon', 100)->nullable();
            $table->boolean('is_active')->default(true);
            $table->jsonb('metadata')->nullable()->default(DB::raw("'{}'::jsonb"));
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();

            // No documentado como UNIQUE en el DDL del skill, pero necesario
            // en la práctica -- mismo criterio ya aplicado en
            // `respel_statuses`: dos filas con el mismo `code` bajo el mismo
            // tenant romperían la resolución determinística de
            // `from_status_code`/`to_status_code` en `workflow_transitions`.
            $table->unique(['tenant_organization_id', 'code']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transport_statuses');
    }
};
