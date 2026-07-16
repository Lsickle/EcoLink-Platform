<?php

namespace App\Policies;

use App\Models\OrganizationalArea;
use App\Models\User;

/**
 * Entidad jerárquica scoped por organización (`organizational_areas.
 * organization_id` NOT NULL, sin equivalente global) -- a diferencia de los
 * catálogos geográficos/`BranchType` (globales, sin aislamiento por
 * instancia), aquí SÍ aplica `OrganizationalArea::isAccessibleBy()` en
 * `view`/`update`/`delete`, mismo criterio que `WasteStreamPolicy`/
 * `UnCodePolicy`. `create` no depende de una instancia -- el controller
 * resuelve la organización destino server-side (ver
 * `OrganizationalAreaController::store()`).
 */
class OrganizationalAreaPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('organizational_areas.read');
    }

    public function view(User $actor, OrganizationalArea $organizationalArea): bool
    {
        return $actor->hasPermission('organizational_areas.read') && $organizationalArea->isAccessibleBy($actor);
    }

    public function create(User $actor): bool
    {
        return $actor->hasPermission('organizational_areas.manage');
    }

    public function update(User $actor, OrganizationalArea $organizationalArea): bool
    {
        return $actor->hasPermission('organizational_areas.manage') && $organizationalArea->isAccessibleBy($actor);
    }

    public function delete(User $actor, OrganizationalArea $organizationalArea): bool
    {
        return $actor->hasPermission('organizational_areas.manage') && $organizationalArea->isAccessibleBy($actor);
    }
}
