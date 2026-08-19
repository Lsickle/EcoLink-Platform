<?php

namespace App\Notifications;

use App\Models\WasteServiceRequest;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Aviso al GENERADOR de que su solicitud quedó resuelta.
 *
 * El otro extremo de `ServiceRequestSubmittedNotification`: sin esto, quien
 * envía una solicitud tampoco se entera de que le respondieron.
 *
 * Un rechazo NO es el final del camino -- la solicitud se puede reabrir
 * (`REJECTED -> DRAFT`, D-S23, `ServiceRequestController::reopen()`), así que
 * el correo lo dice en vez de dejar al Generador creyendo que perdió el
 * trabajo.
 */
class ServiceRequestDecidedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        private readonly WasteServiceRequest $serviceRequest,
        private readonly string $counterpartyName,
        private readonly bool $approved,
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
        $resultado = $this->approved ? 'aprobada' : 'rechazada';

        $message = (new MailMessage)
            ->subject("Su solicitud {$this->serviceRequest->request_code} fue {$resultado}")
            ->greeting('Hola,')
            ->line("\"{$this->counterpartyName}\" {$resultado} la solicitud de servicio {$this->serviceRequest->request_code}.");

        if ($this->approved) {
            return $message->line('El siguiente paso es la programación de la recolección.');
        }

        return $message
            ->line('Puede consultar en EcoLink el motivo indicado en cada residuo.')
            ->line('Un rechazo no cierra el caso: la solicitud se puede corregir y volver a enviar.');
    }
}
