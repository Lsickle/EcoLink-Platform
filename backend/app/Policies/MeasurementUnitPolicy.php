<?php

namespace App\Policies;

use App\Models\MeasurementUnit;
use App\Models\User;

/**
 * Catálogo "Unidad de Medida", global -- sin `tenant_organization_id`.
 * `measurement_units.manage` cubre create/update/activate/deactivate, mismo
 * criterio que `branch_types.manage`/`physical_states.manage`.
 */
class MeasurementUnitPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('measurement_units.read');
    }

    public function view(User $actor, MeasurementUnit $measurementUnit): bool
    {
        return $actor->hasPermission('measurement_units.read');
    }

    public function create(User $actor): bool
    {
        return $actor->hasPermission('measurement_units.manage');
    }

    public function update(User $actor, MeasurementUnit $measurementUnit): bool
    {
        return $actor->hasPermission('measurement_units.manage');
    }
}
