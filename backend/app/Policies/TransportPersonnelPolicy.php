<?php

namespace App\Policies;

use App\Models\Organization;
use App\Models\TransportPersonnel;
use App\Models\User;

/**
 * CRUD de Conductores (`transport_personnel`, extensión 1:1 de `Person` --
 * esquema-bd hallazgo #7). Acceso DUAL, mismo patrón exacto que
 * `VehiclePolicy`/`TransportSchedulePolicy`: platform staff gestiona TODO el
 * personal de transporte de CUALQUIER organización; un admin de tenant (o
 * LOGÍSTICA, solo lectura vía `transport_personnel.read`) gestiona SOLO el
 * de su propia organización -- ver `TransportPersonnel::isAccessibleBy()`.
 *
 * `create()` exige la MISMA capacidad de negocio `can_transport_waste` que
 * `TransportSchedulePolicy::create()` (D-PRG-04/RN-090): una organización
 * sin capacidad de transporte no tiene conductores propios que registrar.
 */
class TransportPersonnelPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('transport_personnel.read');
    }

    public function view(User $actor, TransportPersonnel $transportPersonnel): bool
    {
        return $actor->hasPermission('transport_personnel.read') && $transportPersonnel->isAccessibleBy($actor);
    }

    public function create(User $actor, ?int $organizationId = null): bool
    {
        if (! $actor->hasPermission('transport_personnel.create')) {
            return false;
        }

        if ($actor->isPlatformStaff()) {
            return true;
        }

        $organizationId ??= $actor->tenant_organization_id;
        $organization = Organization::query()->find($organizationId);

        return $organization !== null && $organization->hasCapability('can_transport_waste');
    }

    public function update(User $actor, TransportPersonnel $transportPersonnel): bool
    {
        return $actor->hasPermission('transport_personnel.update') && $transportPersonnel->isAccessibleBy($actor);
    }
}
