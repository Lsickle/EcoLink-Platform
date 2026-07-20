<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd (manifest_statuses, D-MAN-01, 2026-07-10): catálogo de estados
// de `manifest_loads` (y del futuro `manifest_unloads`, Fase 5) -- mismo
// patrón EXACTO que `transport_statuses`/`respel_statuses` (catálogo BASE
// sembrado bajo la organización PLATAFORMA, `tenant_organization_id`
// NOT NULL, sin `is_system`/activación-por-organización todavía, mismo
// diferimiento ya aplicado por D-PRG-08/D-S15).
//
// Seed real confirmado (8 valores, esquema-bd item 11/D-MAN-01, issue
// MAN-17): Draft(1,initial) -> Generated(2) -> PartiallySigned(3) ->
// Signed(4) -> InTransit(5) -> Received(6) -> Closed(7,final) ->
// Cancelled(8,final) -- ver ManifestStatusSeeder.
//
// Alcance de ESTE lote (Fase 3, "Manifiesto de Cargue"): solo se transiciona
// `manifest_loads` hasta InTransit -- Received/Closed pertenecen al ciclo de
// vida del futuro `manifest_unloads` (Fase 5, descarga en planta del
// Gestor), documentado explícitamente como alcance diferido (no se
// construye esa tabla en este lote).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('manifest_statuses', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('tenant_organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->string('code', 50);
            $table->string('name', 100);
            $table->text('description')->nullable();
            $table->integer('sort_order')->default(1);
            $table->boolean('is_initial')->default(false);
            $table->boolean('is_final')->default(false);
            $table->string('color_hex', 7)->nullable();
            $table->string('icon', 100)->nullable();
            $table->boolean('is_active')->default(true);
            $table->jsonb('metadata')->nullable()->default(DB::raw("'{}'::jsonb"));
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();

            // No documentado como UNIQUE en el DDL del skill, pero necesario
            // en la práctica -- mismo criterio ya aplicado en
            // `transport_statuses`/`respel_statuses`: dos filas con el mismo
            // `code` bajo el mismo tenant romperían la resolución
            // determinística de `from_status_code`/`to_status_code` en
            // `workflow_transitions`.
            $table->unique(['tenant_organization_id', 'code']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('manifest_statuses');
    }
};
