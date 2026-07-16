<?php

namespace App\Policies;

use App\Models\OrganizationContact;
use App\Models\User;

/**
 * esquema-bd: organization_contacts (D-P02). Acceso dual: platform staff
 * gestiona los vínculos de CUALQUIER organización; un admin de tenant solo
 * los de su propia organización (`tenant_organization_id`) -- mismo
 * criterio de accesibilidad que `Branch::isAccessibleBy()`, aplicado aquí
 * directamente sobre `organization_id` del vínculo (no hay instancia de
 * `Branch` disponible en todos los casos, el vínculo puede no tener sede).
 */
class OrganizationContactPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('contacts.read');
    }

    public function create(User $actor): bool
    {
        return $actor->hasPermission('contacts.create');
    }

    public function update(User $actor, OrganizationContact $organizationContact): bool
    {
        return $actor->hasPermission('contacts.update')
            && ($actor->isPlatformStaff() || $organizationContact->organization_id === $actor->tenant_organization_id);
    }
}
