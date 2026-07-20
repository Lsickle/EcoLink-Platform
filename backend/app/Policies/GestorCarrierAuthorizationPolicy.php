<?php

namespace App\Policies;

use App\Models\GestorCarrierAuthorization;
use App\Models\User;

/**
 * Módulo Programación Logística, Fase 4 -- `gestor_carrier_authorizations`
 * ("Modalidad 3", ver docblock de la migración
 * create_gestor_carrier_authorizations_table). Acceso DUAL NO simétrico
 * (mismo criterio que `UnloadRequestPolicy`): AMBOS lados (Gestor Y
 * Transportador) pueden VER el registro, pero SOLO el Gestor dueño de
 * `gestor_organization_id` puede crear/revocar -- el Transportador NUNCA
 * puede auto-autorizarse (anti-IDOR explícito, ver
 * `GestorCarrierAuthorizationController::store()`).
 */
class GestorCarrierAuthorizationPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('gestor_carrier_authorizations.read');
    }

    public function view(User $actor, GestorCarrierAuthorization $authorization): bool
    {
        return $actor->hasPermission('gestor_carrier_authorizations.read') && $authorization->isAccessibleBy($actor);
    }

    /**
     * `$gestorOrganizationId` es la organización Gestor que autoriza --
     * mismo criterio anti-role-smuggling que `TransportSchedulePolicy::create()`:
     * un tenant admin SIEMPRE autoriza desde SU PROPIA organización, solo
     * platform staff puede indicar una organización Gestor arbitraria.
     */
    public function create(User $actor, ?int $gestorOrganizationId = null): bool
    {
        if (! $actor->hasPermission('gestor_carrier_authorizations.create')) {
            return false;
        }

        if ($actor->isPlatformStaff()) {
            return true;
        }

        $gestorOrganizationId ??= $actor->tenant_organization_id;

        return $gestorOrganizationId === $actor->tenant_organization_id;
    }

    /**
     * Solo el Gestor DUEÑO de `gestor_organization_id` puede revocar --
     * el Transportador autorizado, aunque tenga acceso de LECTURA (ver
     * `isAccessibleBy()`), no puede revocar su propia autorización.
     */
    public function revoke(User $actor, GestorCarrierAuthorization $authorization): bool
    {
        return $actor->hasPermission('gestor_carrier_authorizations.revoke')
            && ($actor->isPlatformStaff() || $authorization->gestor_organization_id === $actor->tenant_organization_id);
    }
}
