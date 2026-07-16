<?php

namespace App\Services;

use App\Models\User;
use App\Notifications\PasswordRecoveryCodeNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Punto único de reutilización para "generar+persistir+notificar un código
 * OTP de recuperación de contraseña" -- extraído del bloque que antes vivía
 * inline en `PasswordRecoveryController::forgot()` (mismo criterio ya usado
 * para {@see UserProvisioningService}) para que
 * `UserManagementController::resetPassword()` (CU-006.9, restablecimiento
 * disparado por un ADMINISTRADOR sobre un usuario OBJETIVO) reutilice
 * EXACTAMENTE el mismo mecanismo en vez de duplicarlo.
 *
 * A diferencia de `forgot()` (que resuelve el usuario a partir de un correo
 * público, con rama "correo no existe" + `Hash::make()` dummy para mitigar
 * enumeración por canal lateral de tiempo -- ver AVISO en
 * PasswordRecoveryController), aquí el `$user` YA es una instancia conocida
 * y autorizada (route model binding + Gate ya evaluado por el llamador) --
 * no hay rama "no existe" que mitigar.
 */
class PasswordResetOtpService
{
    /**
     * Hallazgo Alta (especialista-seguridad, 2026-07-13, sobre
     * PasswordRecoveryController -- mismo valor, no se reinterpreta):
     * un código de 6 dígitos memorizable por el usuario debe vivir mucho
     * menos tiempo que un enlace -- 10 minutos acota la ventana de fuerza
     * bruta. `PasswordRecoveryController::OTP_TTL_MINUTES` se define en
     * términos de esta constante para no duplicar el valor.
     */
    public const OTP_TTL_MINUTES = 10;

    /**
     * Genera un código OTP de 6 dígitos, lo persiste (hasheado) en
     * `password_reset_tokens` (upsert atómico por email, mismo criterio que
     * el hallazgo Baja-Media ya corregido en `forgot()`) y notifica al
     * correo de `$user` -- SIEMPRE el correo del usuario recibido, nunca el
     * de un actor distinto que dispare la acción (ver aviso de
     * `UserManagementController::resetPassword()`).
     */
    public static function issueFor(User $user): void
    {
        $code = (string) random_int(100000, 999999);
        $email = Str::lower(trim($user->email));

        DB::table('password_reset_tokens')->upsert(
            [[
                'email' => $email,
                'token' => Hash::make($code),
                'attempts' => 0,
                'created_at' => now(),
            ]],
            ['email'],
            ['token', 'attempts', 'created_at'],
        );

        $user->notify(new PasswordRecoveryCodeNotification($code, self::OTP_TTL_MINUTES));
    }
}
