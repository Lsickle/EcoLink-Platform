<?php

namespace App\Policies;

use App\Models\BranchType;
use App\Models\User;

/**
 * Catálogo "Tipos de Sede", global -- sin `tenant_organization_id`
 * (`branch_types` no tiene esa columna, a diferencia de `waste_streams`/
 * `un_codes`). `branch_types.manage` cubre create/update/activate/deactivate,
 * mismo criterio de simplicidad que `waste_streams.manage`/`un_codes.manage`.
 */
class BranchTypePolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('branch_types.read');
    }

    public function view(User $actor, BranchType $branchType): bool
    {
        return $actor->hasPermission('branch_types.read');
    }

    public function create(User $actor): bool
    {
        return $actor->hasPermission('branch_types.manage');
    }

    public function update(User $actor, BranchType $branchType): bool
    {
        return $actor->hasPermission('branch_types.manage');
    }

    public function delete(User $actor, BranchType $branchType): bool
    {
        return $actor->hasPermission('branch_types.manage');
    }
}
