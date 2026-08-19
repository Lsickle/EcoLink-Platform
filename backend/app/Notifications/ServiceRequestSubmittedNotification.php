<?php

namespace App\Notifications;

use App\Models\WasteServiceRequest;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Aviso al DESTINATARIO de que tiene una solicitud por evaluar.
 *
 * Hasta 2026-08-19 el módulo no tenía ninguna notificación: una solicitud
 * enviada solo se descubría si alguien entraba a mirar. No se podía arreglar
 * antes porque no había a quién avisar -- el destino se deducía de los
 * tratamientos de cada ítem y podían ser varios Gestores a la vez. Con el
 * destinatario único en la cabecera, sí lo hay.
 *
 * NO se revela el detalle de los residuos: el correo dice que hay algo que
 * evaluar y dónde verlo. El detalle vive tras la autenticación, con su propio
 * control de acceso.
 *
 * Mismo criterio `ShouldQueue` + un solo canal `mail` que el resto de
 * notificaciones del proyecto.
 */
class ServiceRequestSubmittedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        private readonly WasteServiceRequest $serviceRequest,
        private readonly string $generatorName,
        private readonly int $itemsCount,
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
        $residuos = $this->itemsCount === 1 ? '1 residuo' : "{$this->itemsCount} residuos";

        return (new MailMessage)
            ->subject("Nueva solicitud de servicio: {$this->serviceRequest->request_code}")
            ->greeting('Hola,')
            ->line("\"{$this->generatorName}\" le envió la solicitud de servicio {$this->serviceRequest->request_code}, con {$residuos}.")
            ->line('Queda a la espera de su evaluación: cada residuo se acepta o se rechaza por separado.')
            ->line('Entre a EcoLink para revisarla.');
    }
}
