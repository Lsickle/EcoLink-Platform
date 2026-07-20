<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Módulo Programación Logística, Fase 4 (revisión especialista-seguridad,
// hallazgo de negocio real): habilita la "Modalidad 3" -- un Transportador
// INDEPENDIENTE (organización propia, NO el Gestor) contratado para mover
// residuos de un Gestor -- escenario confirmado por el usuario como real,
// sin ninguna decisión D-PRG previa que lo cubriera (D-PRG-01..03 solo
// documentan Modalidad 1 Gestor/Subgestor con vehículo propio y Modalidad 2
// autotransporte del Generador vía doble rol GENERATOR+TRANSPORTER,
// D-PRG-04).
//
// MISMO PATRÓN exacto que `organization_cartera_statuses` (D-S04/D-S12),
// pedido explícitamente por el usuario: relación BILATERAL entre DOS
// organizaciones (el Gestor que autoriza y el Transportador autorizado), UN
// SOLO registro VIGENTE por par -- índice único PARCIAL (solo cuando
// is_active=true), historial vía `audit_logs`, SIN borrado físico (el
// registro se conserva y se marca is_active=false al revocar, mismo
// criterio que blocked_at/blocked_by de `organization_cartera_statuses`).
//
// FKs de organización con RESTRICT -- mismo motivo que D-S12: las
// organizaciones nunca se eliminan físicamente (usan soft-delete), así que
// preservar el historial de autorizaciones ante un intento de borrado físico
// es la postura correcta.
//
// Alcance NO resuelto aquí (declarado, no decidido unilateralmente): la
// autorización es INDEFINIDA hasta que se revoque explícitamente -- no tiene
// vigencia temporal (`valid_from`/`valid_until`) ni alcance por sede/ítem.
// Se sigue el criterio MÁS SIMPLE ya usado en `organization_cartera_statuses`
// (que tampoco tiene vigencia temporal) a falta de indicación de negocio en
// contra; si el negocio necesita autorizaciones con fecha de expiración o
// acotadas a ciertos ítems/sedes en el futuro, es una decisión pendiente.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('gestor_carrier_authorizations', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('gestor_organization_id')->constrained('organizations')->restrictOnDelete();
            $table->foreignId('carrier_organization_id')->constrained('organizations')->restrictOnDelete();
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

        // Un solo registro VIGENTE por par (gestor, transportador) -- índice
        // único PARCIAL (solo cuando is_active=true), mismo criterio EXACTO
        // que `organization_cartera_statuses_pair_active_unique` (D-S12).
        DB::statement(
            'CREATE UNIQUE INDEX gestor_carrier_authorizations_pair_active_unique ON gestor_carrier_authorizations (gestor_organization_id, carrier_organization_id) WHERE is_active'
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('gestor_carrier_authorizations');
    }
};
