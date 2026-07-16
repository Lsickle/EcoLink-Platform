<?php

namespace App\Policies;

use App\Models\User;
use App\Models\WasteCategory;

/**
 * Catálogo "Categoría de Residuo", global -- sin `tenant_organization_id`.
 * `waste_categories.manage` cubre create/update/activate/deactivate, mismo
 * criterio que `branch_types.manage`.
 */
class WasteCategoryPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('waste_categories.read');
    }

    public function view(User $actor, WasteCategory $wasteCategory): bool
    {
        return $actor->hasPermission('waste_categories.read');
    }

    public function create(User $actor): bool
    {
        return $actor->hasPermission('waste_categories.manage');
    }

    public function update(User $actor, WasteCategory $wasteCategory): bool
    {
        return $actor->hasPermission('waste_categories.manage');
    }

    public function delete(User $actor, WasteCategory $wasteCategory): bool
    {
        return $actor->hasPermission('waste_categories.manage');
    }
}
