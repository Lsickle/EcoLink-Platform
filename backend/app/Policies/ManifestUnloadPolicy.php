<?php

namespace App\Policies;

use App\Models\ManifestUnload;
use App\Models\UnloadRequest;
use App\Models\User;

/**
 * Módulo Manifiesto de Descargue, Fase 5. Acceso dual NO simétrico (punto 6
 * del enunciado de esta tarea, mismo criterio que `ManifestLoadPolicy` con
 * los lados invertidos): la organización RECEPTORA
 * (`receiving_organization_id`, dueña de la planta donde se descarga)
 * gestiona/inspecciona/genera/cancela; el lado transportador (derivado de la
 * `unload_request` asociada, `carrier_organization_id` -- cubre autotransporte,
 * D-PRG-04) solo puede leer + firmar como `driver_signer_person_id`.
 */
class ManifestUnloadPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('manifest_unloads.read');
    }

    public function view(User $actor, ManifestUnload $manifestUnload): bool
    {
        return $actor->hasPermission('manifest_unloads.read') && $manifestUnload->isAccessibleBy($actor);
    }

    /**
     * Solo la organización RECEPTORA dueña de `$unloadRequest.receiving_branch_id`
     * puede crear el manifiesto de descargue derivado de esa solicitud -- o
     * platform staff.
     */
    public function create(User $actor, UnloadRequest $unloadRequest): bool
    {
        if (! $actor->hasPermission('manifest_unloads.create')) {
            return false;
        }

        return $actor->isPlatformStaff() || $unloadRequest->receivingOrganizationId() === $actor->tenant_organization_id;
    }

    /**
     * Cubre `inspectItems()`/`generate()`/`complete()` -- SOLO el lado
     * RECEPTOR (dueño del manifiesto) puede disparar estas acciones/
     * transiciones humanas, nunca el lado transportador (que solo lee/firma).
     * No alcanzable en un estado FINAL (`Closed`/`Cancelled`).
     */
    public function manage(User $actor, ManifestUnload $manifestUnload): bool
    {
        return $actor->hasPermission('manifest_unloads.update')
            && ($actor->isPlatformStaff() || $manifestUnload->receiving_organization_id === $actor->tenant_organization_id)
            && ! $manifestUnload->manifestStatus?->is_final;
    }

    /**
     * Hallazgo Media (especialista-seguridad, 2026-07-20): `FileController`
     * autoriza SIEMPRE vía `Gate::authorize('update', $entity)` para
     * subir/borrar evidencias (ver su docblock -- "delega en SU Policy
     * real"), pero esta Policy nunca expuso un método `update()` -- solo
     * `manage()`. Como Laravel resuelve una habilidad ausente como "denegado"
     * (nunca lanza), `Gate::authorize('update', ...)` resolvía `false` para
     * CUALQUIER actor, incluido el receptor legítimo -- la subida de
     * evidencias fallaba CERRADO para todos, no era una fuga, pero
     * contradecía el docblock de `File.php`. Delega en la MISMA lógica que
     * `manage()` (mismo criterio de autorización: solo el receptor gestiona,
     * nunca en un estado FINAL) -- no se duplica la regla, se alias.
     */
    public function update(User $actor, ManifestUnload $manifestUnload): bool
    {
        return $this->manage($actor, $manifestUnload);
    }

    public function cancel(User $actor, ManifestUnload $manifestUnload): bool
    {
        return $actor->hasPermission('manifest_unloads.cancel')
            && ($actor->isPlatformStaff() || $manifestUnload->receiving_organization_id === $actor->tenant_organization_id)
            && ! $manifestUnload->manifestStatus?->is_final;
    }

    /**
     * Autorización GRUESA (permiso + acceso al recurso, ambos lados) -- el
     * anti-IDOR FINO de "solo la organización correspondiente al tipo de
     * firmante" vive en `ManifestUnloadSignatureService::assertActorCanSign()`.
     */
    public function sign(User $actor, ManifestUnload $manifestUnload): bool
    {
        return $actor->hasPermission('manifest_unloads.sign') && $manifestUnload->isAccessibleBy($actor);
    }
}
