<?php

namespace App\Policies;

use App\Models\BranchLocation;
use App\Models\User;

/**
 * CRUD mínimo de Muelles (`branch_locations`, Fase 4 "Cita de Recepción en
 * Planta"). Acceso dual, mismo patrón exacto que `BranchPolicy`: platform
 * staff gestiona todos los muelles de cualquier sede; un admin de tenant
 * solo los de sus propias sedes -- ver `BranchLocation::isAccessibleBy()`.
 */
class BranchLocationPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('branch_locations.read');
    }

    public function view(User $actor, BranchLocation $branchLocation): bool
    {
        return $actor->hasPermission('branch_locations.read') && $branchLocation->isAccessibleBy($actor);
    }

    public function create(User $actor): bool
    {
        return $actor->hasPermission('branch_locations.create');
    }

    public function update(User $actor, BranchLocation $branchLocation): bool
    {
        return $actor->hasPermission('branch_locations.update') && $branchLocation->isAccessibleBy($actor);
    }
}
