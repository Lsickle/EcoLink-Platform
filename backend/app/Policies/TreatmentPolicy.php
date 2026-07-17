<?php

namespace App\Policies;

use App\Models\Treatment;
use App\Models\User;

/**
 * Catálogo GLOBAL "Tratamientos" -- a diferencia de `WasteStreamPolicy`
 * (donde `.manage` basta), aquí la ESCRITURA exige ADEMÁS
 * `isPlatformStaff()`: solo el staff de la organización plataforma (EcoLink)
 * gestiona este catálogo, mismo gate binario que
 * `OrganizationController`/`BusinessRoleController`. La LECTURA
 * (`treatments.read`) está disponible para cualquier usuario autenticado con
 * el permiso -- los Gestores lo necesitan para configurar sus
 * `branch_treatments`.
 */
class TreatmentPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('treatments.read');
    }

    public function view(User $actor, Treatment $treatment): bool
    {
        return $actor->hasPermission('treatments.read') && $treatment->isAccessibleBy($actor);
    }

    public function create(User $actor): bool
    {
        return $actor->hasPermission('treatments.create') && $actor->isPlatformStaff();
    }

    public function update(User $actor, Treatment $treatment): bool
    {
        return $actor->hasPermission('treatments.update') && $actor->isPlatformStaff();
    }
}
