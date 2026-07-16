<?php

namespace App\Policies;

use App\Models\HazardCharacteristic;
use App\Models\User;

/**
 * Catálogo "Características de Peligrosidad", global -- sin
 * `tenant_organization_id`. `hazard_characteristics.manage` cubre
 * create/update/activate/deactivate, mismo criterio que
 * `branch_types.manage`/`waste_streams.manage`.
 */
class HazardCharacteristicPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('hazard_characteristics.read');
    }

    public function view(User $actor, HazardCharacteristic $hazardCharacteristic): bool
    {
        return $actor->hasPermission('hazard_characteristics.read');
    }

    public function create(User $actor): bool
    {
        return $actor->hasPermission('hazard_characteristics.manage');
    }

    public function update(User $actor, HazardCharacteristic $hazardCharacteristic): bool
    {
        return $actor->hasPermission('hazard_characteristics.manage');
    }

    public function delete(User $actor, HazardCharacteristic $hazardCharacteristic): bool
    {
        return $actor->hasPermission('hazard_characteristics.manage');
    }
}
