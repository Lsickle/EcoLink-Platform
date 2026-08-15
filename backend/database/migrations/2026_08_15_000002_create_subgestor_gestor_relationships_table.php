<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Fase 2 del ciclo de vida del residuo (2026-08-15). Hasta ahora NO existia
// ninguna relacion Subgestor<->Gestor: las dos tablas comerciales
// (`generator_subgestor_relationships`, `generator_gestor_relationships`)
// tienen siempre al Generador como uno de sus lados.
//
// Acota a que Gestores puede delegarle cada Subgestor una asignacion de
// tratamiento -- sin esto, un Subgestor con el permiso podria registrar
// evaluaciones en nombre de CUALQUIER Gestor del sistema.
//
// La declara el SUBGESTOR (recomendacion propia; el usuario no se pronuncio en
// este punto): un Gestor de referencia no tiene usuarios, asi que no podria
// autorizar nada. Queda auditado quien la creo via `authorized_by`.
//
// MISMO PATRON exacto que `generator_gestor_relationships`: un solo registro
// VIGENTE por par -- indice unico PARCIAL (solo cuando is_active=true),
// revocacion in-place (nunca borrado fisico), auditoria estandar, FKs de
// organizacion con RESTRICT.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('subgestor_gestor_relationships', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('subgestor_organization_id')->constrained('organizations')->restrictOnDelete();
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

        DB::statement(
            'CREATE UNIQUE INDEX subgestor_gestor_relationships_pair_active_unique ON subgestor_gestor_relationships (subgestor_organization_id, gestor_organization_id) WHERE is_active'
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('subgestor_gestor_relationships');
    }
};
