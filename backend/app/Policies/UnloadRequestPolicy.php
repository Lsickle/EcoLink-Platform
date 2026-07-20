<?php

namespace App\Policies;

use App\Models\UnloadRequest;
use App\Models\User;

/**
 * Fase 4 "Cita de Recepción en Planta" -- `unload_requests`. Acceso DUAL NO
 * simétrico (mismo criterio que `ManifestLoadPolicy`): AMBOS lados
 * (`carrier_organization_id` -- quien transporta -- y la organización
 * RECEPTORA dueña de `receiving_branch_id`) pueden VER la solicitud, pero
 * solo el lado TRANSPORTADOR puede crearla/enviarla, y solo el lado
 * RECEPTOR puede decidir (Aprobar/Rechazar) -- ver punto 5 del enunciado de
 * esta tarea ("la planta que RECIBE... decide; quien coordina/transporta
 * puede leer + contraproponer/confirmar franjas, no decidir la aprobación").
 */
class UnloadRequestPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('unload_requests.read');
    }

    public function view(User $actor, UnloadRequest $unloadRequest): bool
    {
        return $actor->hasPermission('unload_requests.read') && $unloadRequest->isAccessibleBy($actor);
    }

    /**
     * Creación manual (D-RCP, caso "anticipada") -- solo el lado
     * TRANSPORTADOR (carrier, o el propio Generador en autotransporte)
     * puede iniciar una solicitud, mismo criterio que
     * `TransportSchedulePolicy::create()`.
     */
    public function create(User $actor): bool
    {
        return $actor->hasPermission('unload_requests.create');
    }

    /**
     * Cubre `submit()` -- solo el lado TRANSPORTADOR (dueño de
     * `carrier_organization_id`) puede enviar su propia solicitud.
     */
    public function manage(User $actor, UnloadRequest $unloadRequest): bool
    {
        return $actor->hasPermission('unload_requests.update')
            && ($actor->isPlatformStaff() || ($unloadRequest->carrier_organization_id !== null && $unloadRequest->carrier_organization_id === $actor->tenant_organization_id));
    }

    /**
     * Cubre `approve()`/`reject()` -- SOLO la organización RECEPTORA
     * (dueña de `receiving_branch_id`) decide.
     */
    public function decide(User $actor, UnloadRequest $unloadRequest): bool
    {
        return $actor->hasPermission('unload_requests.decide')
            && ($actor->isPlatformStaff() || $unloadRequest->receivingOrganizationId() === $actor->tenant_organization_id);
    }
}
