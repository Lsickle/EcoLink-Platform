<?php

namespace App\Policies;

use App\Models\Country;
use App\Models\User;

/**
 * Catálogo geográfico de referencia (ISO), global -- sin `tenant_organization_id`
 * (no hay equivalente de "país propio de un tenant"). Solo lectura desde la
 * UI/API (sin pantalla de "Crear País"): `viewAny`/`view` +
 * `update` (usado exclusivamente por `activate()`/`deactivate()`, mismo
 * criterio de nombre de ability que `UnCodePolicy`/`WasteStreamPolicy` aunque
 * aquí no exista un verbo PUT real).
 */
class CountryPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('geography.read');
    }

    public function view(User $actor, Country $country): bool
    {
        return $actor->hasPermission('geography.read');
    }

    public function update(User $actor, Country $country): bool
    {
        return $actor->hasPermission('geography.manage');
    }
}
