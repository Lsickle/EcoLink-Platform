<?php

namespace App\Policies;

use App\Models\User;
use App\Models\VehicleType;

/**
 * Catálogo "Tipos de Vehículo" (PROVISIONAL, ver AVISO en
 * VehicleTypeSeeder), global -- sin `tenant_organization_id`.
 * `vehicle_types.manage` cubre create/update/activate/deactivate, mismo
 * criterio que `branch_types.manage`/`hazard_characteristics.manage`.
 */
class VehicleTypePolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('vehicle_types.read');
    }

    public function view(User $actor, VehicleType $vehicleType): bool
    {
        return $actor->hasPermission('vehicle_types.read');
    }

    public function create(User $actor): bool
    {
        return $actor->hasPermission('vehicle_types.manage');
    }

    public function update(User $actor, VehicleType $vehicleType): bool
    {
        return $actor->hasPermission('vehicle_types.manage');
    }

    public function delete(User $actor, VehicleType $vehicleType): bool
    {
        return $actor->hasPermission('vehicle_types.manage');
    }
}
