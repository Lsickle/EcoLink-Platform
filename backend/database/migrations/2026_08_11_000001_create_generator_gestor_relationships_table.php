<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Carga Masiva de Generadores por Subgestor/Gestor (confirmado por el
// usuario, 2026-08-11) -- vínculo comercial DIRECTO Generador<->Gestor,
// análogo a `generator_subgestor_relationships` pero con roles invertidos:
// aquí el GESTOR es quien autoriza/gestiona la relación. Hasta ahora la
// relación directa Generador<->Gestor era implícita (D-R07, sin tabla) --
// esta tabla no reemplaza esa lógica de evaluación, solo registra
// explícitamente qué Generadores son "clientes" directos de un Gestor (usado
// por `GeneratorBulkImportService` para no duplicar Generadores ya
// existentes al vincularlos con un Gestor nuevo).
//
// MISMO PATRÓN exacto que `generator_subgestor_relationships`: un solo
// registro VIGENTE por par -- índice único PARCIAL (solo cuando
// is_active=true), revocación in-place (nunca borrado físico), auditoría
// estándar, FKs de organización con RESTRICT.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('generator_gestor_relationships', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('generator_organization_id')->constrained('organizations')->restrictOnDelete();
            $table->foreignId('gestor_organization_id')->constrained('organizations')->restrictOnDelete();
            $table->foreignId('authorized_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampTz('authorized_at')->nullable();
            $table->foreignId('revoked_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampTz('revoked_at')->nullable();
            $table->text('observations')->nullable();
            $table->boolean('is_active')->default(true);
            $table->jsonb('metadata')->nullable()->default(DB::raw("'{}'::jsonb"));
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
        });

        // Un solo registro VIGENTE por par (Generador, Gestor) -- índice
        // único PARCIAL, mismo criterio EXACTO que
        // `generator_subgestor_relationships_pair_active_unique`.
        DB::statement(
            'CREATE UNIQUE INDEX generator_gestor_relationships_pair_active_unique ON generator_gestor_relationships (generator_organization_id, gestor_organization_id) WHERE is_active'
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('generator_gestor_relationships');
    }
};
