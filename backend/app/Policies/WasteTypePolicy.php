<?php

namespace App\Policies;

use App\Models\User;
use App\Models\WasteType;

/**
 * Catálogo "Tipo de Residuo", global -- sin `tenant_organization_id`.
 * `waste_types.manage` cubre create/update/activate/deactivate, mismo
 * criterio que `branch_types.manage`/`physical_states.manage`.
 */
class WasteTypePolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('waste_types.read');
    }

    public function view(User $actor, WasteType $wasteType): bool
    {
        return $actor->hasPermission('waste_types.read');
    }

    public function create(User $actor): bool
    {
        return $actor->hasPermission('waste_types.manage');
    }

    public function update(User $actor, WasteType $wasteType): bool
    {
        return $actor->hasPermission('waste_types.manage');
    }
}
