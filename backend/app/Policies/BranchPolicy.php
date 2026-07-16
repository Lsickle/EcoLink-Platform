<?php

namespace App\Policies;

use App\Models\Branch;
use App\Models\User;

/**
 * CRUD de Sedes vs. Figma. Acceso dual: platform staff gestiona TODAS las
 * sedes; un admin de tenant solo las de su propia organización -- ver
 * `Branch::isAccessibleBy()`. Mismo patrón que `RolePolicy`
 * (`view`/`update` combinan permiso RBAC + accesibilidad de instancia).
 */
class BranchPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('branches.read');
    }

    public function view(User $actor, Branch $branch): bool
    {
        return $actor->hasPermission('branches.read') && $branch->isAccessibleBy($actor);
    }

    public function create(User $actor): bool
    {
        return $actor->hasPermission('branches.create');
    }

    public function update(User $actor, Branch $branch): bool
    {
        return $actor->hasPermission('branches.update') && $branch->isAccessibleBy($actor);
    }
}
