<?php

namespace App\Policies;

use App\Models\BranchTreatment;
use App\Models\User;

/**
 * Habilitación de Tratamientos por Sede. Acceso DUAL, mismo patrón exacto
 * que `BranchPolicy`/`VehiclePolicy`: platform staff gestiona TODOS los
 * `branch_treatments`; un admin de tenant (o usuario con
 * `branch_treatments.read` sin ser platform staff) solo los de su propia
 * organización -- ver `BranchTreatment::isAccessibleBy()`.
 *
 * La restricción de negocio "solo organizaciones GESTOR pueden tener
 * branch_treatments" NO vive aquí -- se valida en
 * `BranchTreatmentController::store()` (defensa en profundidad tanto para
 * platform staff eligiendo organización como para un admin de tenant cuya
 * propia organización ya debería tener el business_role).
 */
class BranchTreatmentPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('branch_treatments.read');
    }

    public function view(User $actor, BranchTreatment $branchTreatment): bool
    {
        return $actor->hasPermission('branch_treatments.read') && $branchTreatment->isAccessibleBy($actor);
    }

    public function create(User $actor): bool
    {
        return $actor->hasPermission('branch_treatments.create');
    }

    public function update(User $actor, BranchTreatment $branchTreatment): bool
    {
        return $actor->hasPermission('branch_treatments.update') && $branchTreatment->isAccessibleBy($actor);
    }
}
