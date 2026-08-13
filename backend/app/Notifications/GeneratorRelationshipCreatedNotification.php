<?php

namespace App\Notifications;

use App\Models\Organization;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Hallazgo de `especialista-seguridad`, 2026-08-12: hoy un Gestor/Subgestor
 * puede vincularse a un Generador (`GeneratorGestorRelationship`/
 * `GeneratorSubgestorRelationship`) de forma unilateral -- sin aviso. Este
 * vínculo es la llave que da acceso de lectura a los residuos declarados del
 * Generador (ver `Waste::isForwardableByGestor()`/`isForwardableBySubgestor()`).
 * Decisión confirmada por el usuario: se le da VISIBILIDAD al Generador
 * (este correo), NO control -- no se le da capacidad de revocar el vínculo.
 * Mismo criterio `ShouldQueue` + un solo canal `mail` que
 * `UserInvitationNotification`.
 */
class GeneratorRelationshipCreatedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        private readonly Organization $linkingOrganization,
        private readonly string $linkingRoleLabel,
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
            ->subject("Nuevo vínculo comercial en EcoLink: {$this->linkingOrganization->legal_name}")
            ->greeting('Hola,')
            ->line("La organización \"{$this->linkingOrganization->legal_name}\" se registró como su {$this->linkingRoleLabel} en EcoLink.")
            ->line('Esto le da acceso de lectura a los residuos que su organización declare, para evaluarlos u ofrecer tratamiento sobre ellos según corresponda.')
            ->line('Si no reconoce esta relación comercial, contacte a soporte de EcoLink.');
    }
}
