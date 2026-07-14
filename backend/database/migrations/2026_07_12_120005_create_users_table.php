<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd: users, con las 2 correcciones validadas del módulo Usuarios y
// Seguridad (D-U02/H10, 2026-07-07):
// - `status_usuario_id` -> `user_status_id` (la tabla referenciada se
//   renombró a `user_statuses`, la columna se homologa al implementar).
// - `mfa_enabled` -> `is_mfa_enabled` (convención is_/has_ del resto del
//   esquema).
// `branch_id`/`avatar_file_id` quedan sin FK: `branches`/`files` fuera de
// alcance de este lote.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('tenant_organization_id')->nullable()->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('organization_id')->nullable()->constrained('organizations')->restrictOnDelete();
            $table->unsignedBigInteger('branch_id')->nullable(); // FK -> branches.id, pendiente (branches fuera de alcance)
            $table->foreignId('person_id')->nullable()->unique()->constrained('people')->cascadeOnDelete();
            $table->string('username', 100)->unique();
            $table->string('email')->unique();
            $table->string('password_hash');
            $table->foreignId('user_status_id')->constrained('user_statuses')->restrictOnDelete();
            $table->timestampTz('last_login_at')->nullable();
            $table->integer('failed_login_attempts')->default(0);
            $table->timestampTz('locked_until')->nullable();
            $table->boolean('is_mfa_enabled')->default(false);
            $table->string('mfa_secret')->nullable();
            $table->timestampTz('email_verified_at')->nullable();
            $table->unsignedBigInteger('avatar_file_id')->nullable(); // FK -> files.id, pendiente (files fuera de alcance)
            $table->jsonb('metadata')->nullable()->default(DB::raw("'{}'::jsonb"));
            $table->boolean('is_active')->default(true);
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};
