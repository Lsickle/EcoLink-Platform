<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd: security_logs. Tabla nueva -- respalda RN-034/RN-035 (toda
// autenticación exitosa/fallida debe registrarse en auditoría), sin
// implementación previa. Reglas ON DELETE tomadas de la corrección ya
// validada D-U03 (módulo Usuarios y Seguridad, 2026-07-07), no del DDL base
// (que las marca "??SIN DEFINIR??"):
// - user_id -> SET NULL (preserva evidencia forense aunque se borre el actor)
// - person_id -> SET NULL, corregido de la tabla inexistente `persons` a
//   `people` (mismo bug H2 ya corregido en audit_logs/manifest_loads/etc.)
// - tenant_organization_id -> RESTRICT
// Mismo patrón ya seguido para user_roles/user_statuses en este proyecto.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('security_logs', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->uuid('traceability_uuid')->nullable();
            $table->foreignId('tenant_organization_id')->nullable()->constrained('organizations')->restrictOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('person_id')->nullable()->constrained('people')->nullOnDelete();
            $table->string('event_type', 50);
            $table->string('result', 20)->default('SUCCESS');
            $table->text('description')->nullable();
            $table->ipAddress('ip_address')->nullable();
            $table->text('user_agent')->nullable();
            $table->string('device_fingerprint')->nullable();
            $table->string('country', 100)->nullable();
            $table->string('city', 100)->nullable();
            $table->uuid('session_id')->nullable();
            $table->string('resource_url', 1000)->nullable();
            $table->string('request_method', 10)->nullable();
            $table->uuid('correlation_id')->nullable();
            $table->jsonb('metadata')->nullable()->default(DB::raw("'{}'::jsonb"));
            $table->string('risk_level', 20)->default('LOW');
            $table->timestampTz('occurred_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('security_logs');
    }
};
