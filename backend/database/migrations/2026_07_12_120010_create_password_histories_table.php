<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// esquema-bd, módulo Usuarios y Seguridad (D-U06, 2026-07-07): tabla NUEVA
// -- respalda RN-039 ("no reutilizar contraseñas recientes"), que no tenía
// tabla de soporte. N a validar formalmente con negocio (esquema-bd asume
// 5 como estándar de industria, no confirmado); ver AuthController.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('password_histories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('password_hash');
            $table->timestampTz('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('password_histories');
    }
};
