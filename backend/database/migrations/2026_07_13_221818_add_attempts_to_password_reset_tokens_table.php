<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Hallazgo Alta (especialista-seguridad, 2026-07-13, revisión de
// PasswordRecoveryController): el rate limiter compartido `password-recovery`
// (5/min IP+email, 20/min IP) no pone techo agregado independiente de la
// IP de origen -- un atacante con IPs distribuidas puede acumular intentos
// contra el mismo código OTP de 6 dígitos dentro de su ventana de validez.
// `attempts` es un contador POR CÓDIGO (no por IP): se incrementa en cada
// intento fallido de verificación (verifyCode()/reset()) y, al llegar al
// umbral, la fila se borra -- el código queda inutilizado sin importar
// cuántas IPs distintas lo hayan intentado.
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('password_reset_tokens', function (Blueprint $table) {
            $table->smallInteger('attempts')->default(0);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('password_reset_tokens', function (Blueprint $table) {
            $table->dropColumn('attempts');
        });
    }
};
