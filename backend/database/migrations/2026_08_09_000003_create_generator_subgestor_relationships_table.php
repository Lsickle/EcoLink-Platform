<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Cadena Generador -> Subgestor -> Gestor en Declaración de Residuos
// (confirmado por stakeholders reales, 2026-08-09; no contradice D-R07 --
// D-R07 sigue vigente para el caso DIRECTO Generador<->Gestor, esta es una
// ruta ADICIONAL para el caso INDIRECTO vía Subgestor). Cuando un Generador
// tiene relación comercial con un Subgestor específico, sus residuos
// declarados le llegan primero a ese Subgestor -- que no puede evaluarlos
// (SUBGESTOR nunca tiene can_treat_waste) pero sí puede reenviarlos a un
// Gestor (ver forwarded_by_organization_id en waste_treatment_approvals).
//
// MISMO PATRÓN exacto que `gestor_carrier_authorizations` (Programación
// Logística, Modalidad 3) y `organization_cartera_statuses` (D-S04/D-S12),
// con roles invertidos: aquí el SUBGESTOR es quien autoriza/gestiona la
// relación (registra qué Generadores son sus clientes), igual que el Gestor
// autoriza Transportadores en `gestor_carrier_authorizations` -- confirmado
// explícitamente por el usuario, no asumido. Un solo registro VIGENTE por
// par -- índice único PARCIAL (solo cuando is_active=true), revocación
// in-place (nunca borrado físico), auditoría estándar.
//
// FKs de organización con RESTRICT -- las organizaciones nunca se eliminan
// físicamente (usan soft-delete), preservar el historial de relaciones ante
// un intento de borrado físico es la postura ya establecida en el proyecto.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('generator_subgestor_relationships', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('generator_organization_id')->constrained('organizations')->restrictOnDelete();
            $table->foreignId('subgestor_organization_id')->constrained('organizations')->restrictOnDelete();
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

        // Un solo registro VIGENTE por par (Generador, Subgestor) -- índice
        // único PARCIAL, mismo criterio EXACTO que
        // `gestor_carrier_authorizations_pair_active_unique`.
        DB::statement(
            'CREATE UNIQUE INDEX generator_subgestor_relationships_pair_active_unique ON generator_subgestor_relationships (generator_organization_id, subgestor_organization_id) WHERE is_active'
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('generator_subgestor_relationships');
    }
};
