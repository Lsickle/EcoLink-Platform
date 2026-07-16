<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Carbon;

/**
 * Mecanismo de invitación de usuarios (reemplaza el registro público
 * eliminado -- CU-006.1 modificado): correo con el enlace de activación.
 * Mismo criterio que PasswordRecoveryCodeNotification: `ShouldQueue`, un
 * solo canal `mail`, el token en TEXTO PLANO solo viaja aquí (en BD se
 * persiste hasheado, ver UserInvitation::issueFor()).
 */
class UserInvitationNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        private readonly string $token,
        private readonly Carbon $expiresAt,
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
        $url = rtrim((string) config('app.frontend_url'), '/')."/accept-invitation?token={$this->token}";

        return (new MailMessage)
            ->subject('Has sido invitado a EcoLink')
            ->greeting('Hola,')
            ->line('Un administrador te ha invitado a crear tu cuenta en EcoLink.')
            ->action('Activar mi cuenta', $url)
            ->line('Este enlace vence el '.$this->expiresAt->format('d/m/Y H:i').'.')
            ->line('Si no esperabas esta invitación, puedes ignorar este mensaje.');
    }
}
