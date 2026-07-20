<?php

namespace App\Policies;

use App\Models\ManifestLoad;
use App\Models\TransportSchedule;
use App\Models\User;

/**
 * Módulo Manifiesto de Cargue, Fase 3. Acceso dual NO simétrico (punto 8 del
 * enunciado de esta tarea, mismo criterio que `ServiceRequestPolicy`): AMBOS
 * lados de la operación (`carrier_organization_id` -- el Gestor/actor que
 * programó el transporte -- y la organización Generadora dueña de
 * `generator_branch_id`) pueden VER el manifiesto, pero solo el lado
 * transportador (carrier) puede crear/generar/transicionar/cancelar. El
 * Generador tiene solo lectura + firmar como `generator_signer_person_id`
 * (`sign()`, ver `ManifestLoadSignatureService::assertActorCanSign()` para
 * el anti-IDOR fino por tipo de firmante).
 */
class ManifestLoadPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('manifest_loads.read');
    }

    public function view(User $actor, ManifestLoad $manifestLoad): bool
    {
        return $actor->hasPermission('manifest_loads.read') && $manifestLoad->isAccessibleBy($actor);
    }

    /**
     * Solo la organización que programó el transporte (dueña de
     * `$transportSchedule`, la misma que quedará como `carrier_organization_id`
     * del manifiesto) puede crear el manifiesto derivado de esa programación
     * -- o platform staff.
     */
    public function create(User $actor, TransportSchedule $transportSchedule): bool
    {
        if (! $actor->hasPermission('manifest_loads.create')) {
            return false;
        }

        return $actor->isPlatformStaff() || $transportSchedule->organization_id === $actor->tenant_organization_id;
    }

    /**
     * Cubre `generate()`/`startTransit()` -- SOLO el lado transportador
     * (`carrier_organization_id`, dueño del manifiesto) puede disparar estas
     * transiciones humanas, nunca el Generador (que solo lee/firma). No
     * alcanzable en un estado FINAL (`Closed`/`Cancelled` -- ninguno de los
     * dos se alcanza en este lote, pero se deja la guarda para cuando el
     * futuro `manifest_unloads` reutilice el mismo catálogo).
     */
    public function manage(User $actor, ManifestLoad $manifestLoad): bool
    {
        return $actor->hasPermission('manifest_loads.update')
            && ($actor->isPlatformStaff() || $manifestLoad->carrier_organization_id === $actor->tenant_organization_id)
            && ! $manifestLoad->manifestStatus?->is_final;
    }

    public function cancel(User $actor, ManifestLoad $manifestLoad): bool
    {
        return $actor->hasPermission('manifest_loads.cancel')
            && ($actor->isPlatformStaff() || $manifestLoad->carrier_organization_id === $actor->tenant_organization_id)
            && ! $manifestLoad->manifestStatus?->is_final;
    }

    /**
     * Autorización GRUESA (permiso + acceso al recurso, ambos lados) -- el
     * anti-IDOR FINO de "solo la organización correspondiente al tipo de
     * firmante" vive en `ManifestLoadSignatureService::assertActorCanSign()`,
     * no aquí (mismo criterio de capas que `ServiceRequestPolicy::evaluateItem()`
     * delega en `WasteServiceRequestItem::isEvaluableBy()`).
     */
    public function sign(User $actor, ManifestLoad $manifestLoad): bool
    {
        return $actor->hasPermission('manifest_loads.sign') && $manifestLoad->isAccessibleBy($actor);
    }
}
