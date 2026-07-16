<?php

namespace App\Policies;

use App\Models\PackagingCondition;
use App\Models\User;

/**
 * Catálogo "Estados del Embalaje" (PROVISIONAL, ver AVISO en
 * PackagingConditionSeeder), global -- sin `tenant_organization_id`.
 * `packaging_conditions.manage` cubre create/update/activate/deactivate,
 * mismo criterio que `branch_types.manage`/`hazard_characteristics.manage`.
 */
class PackagingConditionPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('packaging_conditions.read');
    }

    public function view(User $actor, PackagingCondition $packagingCondition): bool
    {
        return $actor->hasPermission('packaging_conditions.read');
    }

    public function create(User $actor): bool
    {
        return $actor->hasPermission('packaging_conditions.manage');
    }

    public function update(User $actor, PackagingCondition $packagingCondition): bool
    {
        return $actor->hasPermission('packaging_conditions.manage');
    }

    public function delete(User $actor, PackagingCondition $packagingCondition): bool
    {
        return $actor->hasPermission('packaging_conditions.manage');
    }
}
