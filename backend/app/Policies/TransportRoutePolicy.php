<?php

namespace App\Policies;

use App\Models\Organization;
use App\Models\TransportRoute;
use App\Models\User;

/**
 * CRUD MÍNIMO de Rutas (`transport_routes`, CU-059 "Agrupar por Zona/Ruta").
 * Acceso DUAL, mismo patrón exacto que `TransportSchedulePolicy`/
 * `TransportPersonnelPolicy`: `transport_routes.organization_id` es SIEMPRE
 * la organización que arma/coordina la ruta -- platform staff gestiona
 * TODAS; un admin de tenant (o LOGÍSTICA) solo las suyas -- ver
 * `TransportRoute::isAccessibleBy()`.
 *
 * `create()` exige la MISMA capacidad `can_transport_waste` (D-PRG-04): solo
 * una organización transportadora arma rutas de transporte.
 */
class TransportRoutePolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('transport_routes.read');
    }

    public function view(User $actor, TransportRoute $route): bool
    {
        return $actor->hasPermission('transport_routes.read') && $route->isAccessibleBy($actor);
    }

    public function create(User $actor, ?int $organizationId = null): bool
    {
        if (! $actor->hasPermission('transport_routes.create')) {
            return false;
        }

        if ($actor->isPlatformStaff()) {
            return true;
        }

        $organizationId ??= $actor->tenant_organization_id;
        $organization = Organization::query()->find($organizationId);

        return $organization !== null && $organization->hasCapability('can_transport_waste');
    }
}
