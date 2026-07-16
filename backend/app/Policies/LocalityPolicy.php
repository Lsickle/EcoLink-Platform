<?php

namespace App\Policies;

use App\Models\Locality;
use App\Models\User;

/**
 * Catálogo geográfico de referencia (localidades de Bogotá D.C.), global --
 * ver `CountryPolicy` para el criterio completo (mismo patrón exacto).
 */
class LocalityPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('geography.read');
    }

    public function view(User $actor, Locality $locality): bool
    {
        return $actor->hasPermission('geography.read');
    }

    public function update(User $actor, Locality $locality): bool
    {
        return $actor->hasPermission('geography.manage');
    }
}
