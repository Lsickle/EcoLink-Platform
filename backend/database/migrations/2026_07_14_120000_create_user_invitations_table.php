<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Mecanismo de invitación de usuarios (reemplaza el registro público
// eliminado de AuthController -- CU-006.1 modificado): tabla NUEVA, fila de
// estado TRANSITORIO por usuario invitado, gestionada vía upsert() (mismo
// patrón que password_reset_tokens en PasswordRecoveryController), no un
// catálogo -- por eso sin SoftDeletes (ver UserInvitation).
//
// UNIQUE(user_id): un usuario tiene a lo sumo UNA fila de invitación viva --
// un reenvío (UserManagementController::resendInvitation()) reutiliza la
// MISMA fila vía UserInvitation::issueFor() en vez de acumular filas
// históricas por reenvío.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_invitations', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('user_id')->unique()->constrained('users')->cascadeOnDelete();
            $table->string('token_hash');
            $table->foreignId('invited_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampTz('expires_at');
            $table->timestampTz('accepted_at')->nullable();
            $table->integer('resend_count')->default(0);
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_invitations');
    }
};
