<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * CU-009.1: correo con el código OTP de 6 dígitos para recuperar
 * contraseña. El código llega en texto plano solo aquí (por correo) -- en
 * BD se persiste hasheado (ver PasswordRecoveryController::forgot()).
 *
 * Hallazgo Media (especialista-seguridad, 2026-07-13, revisión de
 * PasswordRecoveryController): `ShouldQueue` saca el envío (y el coste de
 * red/SMTP que implica) del ciclo de vida de la request HTTP -- parte de la
 * mitigación del canal lateral por tiempo entre la rama "correo existe" y
 * "correo no existe" de forgot() (ver aviso en el controller sobre por qué
 * esto NO cierra el hallazgo por completo con QUEUE_CONNECTION=database).
 */
class PasswordRecoveryCodeNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        private readonly string $code,
        private readonly int $expirationMinutes,
    ) {}

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
            ->subject('Código de verificación para recuperar tu contraseña')
            ->greeting('Hola,')
            ->line('Recibimos una solicitud para restablecer la contraseña de tu cuenta en EcoLink.')
            ->line("Tu código de verificación es: {$this->code}")
            ->line("Este código vence en {$this->expirationMinutes} minutos.")
            ->line('Si no solicitaste este cambio, puedes ignorar este mensaje -- tu contraseña seguirá siendo la misma.');
    }
}
