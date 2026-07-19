<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd (D-S04/D-S12): organization_cartera_statuses -- estado de
// CARTERA BILATERAL entre un Generador y un Gestor específico (ej. "la
// empresa X tiene cartera vencida con el Gestor Prosarc" bloquea SOLO las
// solicitudes de X hacia Prosarc, no hacia otros Gestores). Distinto del
// estado GLOBAL de organización (`organization_statuses`, de EcoLink hacia
// una sola organización) -- esta es una relación ENTRE DOS organizaciones
// socias.
//
// D-S12 (confirmado por el usuario): UN SOLO registro VIGENTE por par
// (Generador, Gestor) -- se actualiza in-place al cambiar de estado; el
// historial de cambios se consulta desde `audit_logs`, sin filas históricas
// adicionales. `UNIQUE (generator_organization_id, gestor_organization_id)
// WHERE is_active` (índice parcial, no una migración de `unique()` simple,
// porque la unicidad solo aplica al registro VIGENTE).
//
// FKs de organización con `RESTRICT` (D-S12, confirmado por el usuario):
// "las organizaciones nunca deberían eliminarse físicamente de la base de
// datos (usan soft_delete/deleted_at)" -- preservar el historial de cartera
// ante un intento de borrado físico es la postura correcta, a diferencia
// del placeholder ilustrativo CASCADE que había propuesto
// `arquitecto-datos` antes de la validación humana.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('organization_cartera_statuses', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('generator_organization_id')->constrained('organizations')->restrictOnDelete();
            $table->foreignId('gestor_organization_id')->constrained('organizations')->restrictOnDelete();
            $table->foreignId('cartera_status_id')->constrained('cartera_statuses')->restrictOnDelete();
            $table->text('reason')->nullable();
            $table->timestampTz('blocked_at')->nullable();
            $table->foreignId('blocked_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampTz('unblocked_at')->nullable();
            $table->foreignId('unblocked_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('observations')->nullable();
            $table->boolean('is_active')->default(true);
            $table->jsonb('metadata')->nullable()->default(DB::raw("'{}'::jsonb"));
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
        });

        // D-S12: un solo registro VIGENTE por par -- índice único PARCIAL
        // (solo cuando is_active=true), no un UNIQUE de tabla completa.
        DB::statement(
            'CREATE UNIQUE INDEX organization_cartera_statuses_pair_active_unique ON organization_cartera_statuses (generator_organization_id, gestor_organization_id) WHERE is_active'
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('organization_cartera_statuses');
    }
};
