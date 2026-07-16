<?php

namespace App\Policies;

use App\Models\Department;
use App\Models\User;

/**
 * Catálogo geográfico de referencia (DANE), global -- ver `CountryPolicy`
 * para el criterio completo (mismo patrón exacto, catálogo hermano del
 * siguiente nivel de la jerarquía país->departamento->municipio->localidad).
 */
class DepartmentPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('geography.read');
    }

    public function view(User $actor, Department $department): bool
    {
        return $actor->hasPermission('geography.read');
    }

    public function update(User $actor, Department $department): bool
    {
        return $actor->hasPermission('geography.manage');
    }
}
