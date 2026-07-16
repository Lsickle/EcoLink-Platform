<?php

namespace App\Policies;

use App\Models\PackagingType;
use App\Models\User;

/**
 * Catálogo "Tipos de Embalaje", global -- sin `tenant_organization_id`.
 * `packaging_types.manage` cubre create/update/activate/deactivate, mismo
 * criterio que `branch_types.manage`/`hazard_characteristics.manage`.
 */
class PackagingTypePolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('packaging_types.read');
    }

    public function view(User $actor, PackagingType $packagingType): bool
    {
        return $actor->hasPermission('packaging_types.read');
    }

    public function create(User $actor): bool
    {
        return $actor->hasPermission('packaging_types.manage');
    }

    public function update(User $actor, PackagingType $packagingType): bool
    {
        return $actor->hasPermission('packaging_types.manage');
    }

    public function delete(User $actor, PackagingType $packagingType): bool
    {
        return $actor->hasPermission('packaging_types.manage');
    }
}
