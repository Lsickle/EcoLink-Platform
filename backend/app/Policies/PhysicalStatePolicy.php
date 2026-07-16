<?php

namespace App\Policies;

use App\Models\PhysicalState;
use App\Models\User;

/**
 * Catálogo "Estado Físico", global -- sin `tenant_organization_id`.
 * `physical_states.manage` cubre create/update/activate/deactivate, mismo
 * criterio que `branch_types.manage`.
 */
class PhysicalStatePolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('physical_states.read');
    }

    public function view(User $actor, PhysicalState $physicalState): bool
    {
        return $actor->hasPermission('physical_states.read');
    }

    public function create(User $actor): bool
    {
        return $actor->hasPermission('physical_states.manage');
    }

    public function update(User $actor, PhysicalState $physicalState): bool
    {
        return $actor->hasPermission('physical_states.manage');
    }

    public function delete(User $actor, PhysicalState $physicalState): bool
    {
        return $actor->hasPermission('physical_states.manage');
    }
}
