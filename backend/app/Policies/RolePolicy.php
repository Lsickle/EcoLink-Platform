<?php

namespace App\Policies;

use App\Models\Role;
use App\Models\User;

/**
 * CU-007 (Gestionar Roles). RN-028: toda decisión delega en
 * User::hasPermission() (roles -> role_permissions -> permissions).
 *
 * Hallazgo Crítico (especialista-seguridad, 2026-07-13, segunda pasada):
 * `view/update/delete` no tenían NINGÚN chequeo de tenant -- un actor de
 * cualquier organización podía ver/editar/borrar un rol propio de OTRA
 * organización. Se agrega `Role::isAccessibleBy($actor)`, que NO es la
 * misma regla que `User::isSameTenantAs()` -- ver aviso en el modelo Role.
 */
class RolePolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('roles.read');
    }

    public function view(User $actor, Role $role): bool
    {
        return $actor->hasPermission('roles.read') && $role->isAccessibleBy($actor);
    }

    public function create(User $actor): bool
    {
        return $actor->hasPermission('roles.create');
    }

    public function update(User $actor, Role $role): bool
    {
        return $actor->hasPermission('roles.update') && $role->isAccessibleBy($actor);
    }

    public function delete(User $actor, Role $role): bool
    {
        return $actor->hasPermission('roles.delete') && $role->isAccessibleBy($actor);
    }

    /**
     * `roles.assign`: asignar un rol existente a un usuario (crea/actualiza
     * una fila en user_roles) -- capacidad general, no depende de una
     * instancia concreta de Role (el chequeo de que ESE rol concreto sea
     * accesible por el actor vive en RoleController::assignToUser(), donde
     * sí se conoce la instancia -- ver aviso ahí).
     */
    public function assign(User $actor): bool
    {
        return $actor->hasPermission('roles.assign');
    }
}
