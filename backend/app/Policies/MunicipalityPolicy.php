<?php

namespace App\Policies;

use App\Models\Municipality;
use App\Models\User;

/**
 * Catálogo geográfico de referencia (DANE), global -- ver `CountryPolicy`
 * para el criterio completo (mismo patrón exacto).
 */
class MunicipalityPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('geography.read');
    }

    public function view(User $actor, Municipality $municipality): bool
    {
        return $actor->hasPermission('geography.read');
    }

    public function update(User $actor, Municipality $municipality): bool
    {
        return $actor->hasPermission('geography.manage');
    }
}
