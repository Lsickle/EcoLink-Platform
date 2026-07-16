<?php

namespace App\Policies;

use App\Models\User;

/**
 * CU-006 (Gestionar Usuarios). RN-028: toda decisión de autorización
 * delega en User::hasPermission(), que resuelve permisos vía roles -- nunca
 * directo al usuario.
 *
 * Hallazgo Crítico (especialista-seguridad, 2026-07-13): ningún método
 * validaba aislamiento multi-tenant -- un ADMINISTRADOR de cualquier
 * organización podía ver/editar/activar/desactivar usuarios de CUALQUIER
 * otra organización con solo conocer el `id`. Todos los métodos que
 * reciben un `$target` ahora exigen además `$actor->isSameTenantAs($target)`
 * (comparación exacta de `tenant_organization_id`, incluyendo NULL=NULL).
 * Sin jerarquía matriz-hija (RN-188) todavía -- pendiente explícito, no se
 * replica aquí (ver resumen entregado al hilo principal).
 *
 * `activate`/`deactivate`/`resetPassword` no son verbos CRUD estándar de
 * Laravel, se definen como métodos custom (Gate::authorize('activate',
 * $target)). Hallazgo Medio (especialista-seguridad, 2026-07-13): un solo
 * permiso `users.activate` cubría ambas direcciones (activar/inactivar),
 * violando mínimo privilegio -- se separan en `users.activate`/
 * `users.deactivate` (ver PermissionSeeder/RolePermissionSeeder).
 * `resetPassword` (CU-006.9, `UserManagementController::resetPassword()`)
 * consume este método -- gateado por `users.reset-password` (ya sembrado,
 * `ADMINISTRADOR` lo tiene asignado, confirmado 2026-07-13).
 */
class UserPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('users.read');
    }

    public function view(User $actor, User $target): bool
    {
        return $actor->hasPermission('users.read') && $actor->isSameTenantAs($target);
    }

    public function create(User $actor): bool
    {
        return $actor->hasPermission('users.create');
    }

    public function update(User $actor, User $target): bool
    {
        return $actor->hasPermission('users.update') && $actor->isSameTenantAs($target);
    }

    public function delete(User $actor, User $target): bool
    {
        return $actor->hasPermission('users.delete') && $actor->isSameTenantAs($target);
    }

    public function activate(User $actor, User $target): bool
    {
        return $actor->hasPermission('users.activate') && $actor->isSameTenantAs($target);
    }

    public function deactivate(User $actor, User $target): bool
    {
        return $actor->hasPermission('users.deactivate') && $actor->isSameTenantAs($target);
    }

    public function resetPassword(User $actor, User $target): bool
    {
        return $actor->hasPermission('users.reset-password') && $actor->isSameTenantAs($target);
    }

    /**
     * Deuda arquitectónica señalada en la revisión de seguridad (2026-07-13,
     * bajo riesgo): antes vivía como chequeo manual `isSameTenantAs()` dentro
     * de `UserManagementController::resendInvitation()`, a diferencia de
     * `show/update/activate/deactivate`, que ya delegaban en la Policy.
     * Mismo permiso que `store()`/`create` (`users.create`) -- crear un
     * usuario y reenviarle el acceso son la misma capacidad administrativa.
     */
    public function resendInvitation(User $actor, User $target): bool
    {
        return $actor->hasPermission('users.create') && $actor->isSameTenantAs($target);
    }
}
