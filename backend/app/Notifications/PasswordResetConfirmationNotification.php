<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * CU-009.7 (subset MVP): confirmación de que la contraseña fue
 * restablecida exitosamente. Sin datos sensibles (ni la contraseña nueva
 * ni el código usado) -- mismo criterio de no filtrar información ya usado
 * en el resto del módulo de autenticación.
 *
 * `ShouldQueue`: mismo motivo que PasswordRecoveryCodeNotification -- no
 * bloquear la respuesta HTTP de reset() con el envío del correo.
 */
class PasswordResetConfirmationNotification extends Notification implements ShouldQueue
{
    use Queueable;

    /**
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Tu contraseña fue actualizada')
            ->greeting('Hola,')
            ->line('La contraseña de tu cuenta en EcoLink fue restablecida correctamente.')
            ->line('Si no realizaste este cambio, contacta a soporte de inmediato.');
    }
}
