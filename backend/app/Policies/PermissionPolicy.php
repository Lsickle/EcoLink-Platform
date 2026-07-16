<?php

namespace App\Policies;

use App\Models\Permission;
use App\Models\User;

/**
 * CU-008 (Gestionar Permisos). Interpretación confirmada de este lote: los
 * permisos son un catálogo fijo sembrado por código, no editable desde la
 * UI/API -- por eso esta Policy solo cubre lectura (`viewAny`/`view`) y la
 * asignación permiso<->rol (`assign`), sin create/update/delete.
 */
class PermissionPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('permissions.read');
    }

    public function view(User $actor, Permission $permission): bool
    {
        return $actor->hasPermission('permissions.read') && $permission->isAccessibleBy($actor);
    }

    /**
     * `permissions.assign`: asignar un permiso existente a un rol (crea/
     * actualiza una fila en role_permissions) -- capacidad general, no
     * depende de una instancia concreta de Permission.
     */
    public function assign(User $actor): bool
    {
        return $actor->hasPermission('permissions.assign');
    }
}
