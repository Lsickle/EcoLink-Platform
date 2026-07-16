<?php

namespace App\Policies;

use App\Models\UnCode;
use App\Models\User;

/**
 * Catálogo de Códigos ONU de transporte -- mismo patrón que
 * WasteStreamPolicy (un_codes.manage cubre create/update/activate/
 * deactivate/import).
 */
class UnCodePolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('un_codes.read');
    }

    public function view(User $actor, UnCode $unCode): bool
    {
        return $actor->hasPermission('un_codes.read') && $unCode->isAccessibleBy($actor);
    }

    public function create(User $actor): bool
    {
        return $actor->hasPermission('un_codes.manage');
    }

    public function update(User $actor, UnCode $unCode): bool
    {
        return $actor->hasPermission('un_codes.manage') && $unCode->isAccessibleBy($actor);
    }

    public function delete(User $actor, UnCode $unCode): bool
    {
        return $actor->hasPermission('un_codes.manage') && $unCode->isAccessibleBy($actor);
    }
}
