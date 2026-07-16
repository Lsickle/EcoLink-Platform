<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Mecanismo de "solicitud de invitación" (reemplaza el registro público de
// AuthController::register(), eliminado en la tarea anterior -- CU-006.1
// modificado): tabla NUEVA, cola de trabajo de solicitudes de acceso
// pendientes de revisión por un ADMINISTRADOR. A diferencia de
// `user_invitations` (fila TRANSITORIA por usuario, sin SoftDeletes), esta
// tabla SÍ conserva historial completo (aprobadas/rechazadas) -- por eso
// tampoco lleva SoftDeletes (el registro se conserva, nunca se borra).
//
// `status` es un string con lista fija (PENDING/APPROVED/REJECTED), sin
// catálogo propio -- mismo criterio que otros campos de estado simple sin
// tabla de catálogo dedicada en este lote (ver AuthController::login()
// contra `user_status_id`, que sí es catálogo porque ya existía; aquí no se
// crea uno nuevo sin evidencia de que el negocio lo necesite).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('invitation_requests', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->string('first_name', 100);
            $table->string('middle_name', 100)->nullable();
            $table->string('last_name', 100);
            $table->string('second_last_name', 100)->nullable();
            $table->string('document_type', 20);
            $table->string('document_number', 50);
            $table->string('email', 255);
            $table->string('phone', 50)->nullable();
            $table->string('status', 20)->default('PENDING');
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampTz('reviewed_at')->nullable();
            $table->text('rejection_reason')->nullable();
            $table->foreignId('resulting_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('invitation_requests');
    }
};
