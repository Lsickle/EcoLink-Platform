<?php

namespace App\Policies;

use App\Models\User;
use App\Models\WasteStream;

/**
 * Módulo Residuos, catálogo "Corrientes de Residuos" (Y/A) -- a diferencia
 * de PermissionPolicy (catálogo de solo lectura), aquí SÍ hay
 * create/update/activate/deactivate/import reales (waste_streams.manage).
 */
class WasteStreamPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('waste_streams.read');
    }

    public function view(User $actor, WasteStream $wasteStream): bool
    {
        return $actor->hasPermission('waste_streams.read') && $wasteStream->isAccessibleBy($actor);
    }

    public function create(User $actor): bool
    {
        return $actor->hasPermission('waste_streams.manage');
    }

    public function update(User $actor, WasteStream $wasteStream): bool
    {
        return $actor->hasPermission('waste_streams.manage') && $wasteStream->isAccessibleBy($actor);
    }

    public function delete(User $actor, WasteStream $wasteStream): bool
    {
        return $actor->hasPermission('waste_streams.manage') && $wasteStream->isAccessibleBy($actor);
    }
}
