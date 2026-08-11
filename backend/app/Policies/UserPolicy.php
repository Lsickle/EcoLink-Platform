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
 * Hallazgo Alto (especialista-seguridad, 2026-08-08): `isSameTenantAs()` sin
 * excepción dejaba al staff de la organización Plataforma (`User::
 * isPlatformStaff()`) sin ningún camino para volver a ver/gestionar un
 * usuario que ELLOS MISMOS crearon bajo el tenant de una organización
 * cliente nueva (ver `UserProvisioningService::resolveTenantOrganizationId()`)
 * -- si la invitación por correo rebotaba o expiraba (TTL 7 días), el
 * usuario quedaba huérfano, sin nadie capaz de reenviar la invitación,
 * reactivarlo o resetear su contraseña. Todos los métodos de abajo agregan
 * `|| $actor->isPlatformStaff()` como excepción de visibilidad/gestión --
 * mismo criterio ya usado en `Role::isAccessibleBy()` (ver ese modelo), pero
 * SIN el acotamiento adicional que `RoleController::users()`/`activity()`
 * necesitaron (ahí el hallazgo Crítico era exponer el ROSTER de PII de
 * terceros vía un rol GLOBAL ajeno al actor; aquí el `$target` YA ES el
 * usuario concreto que se quiere gestionar, no un listado de terceros
 * desconocidos -- conceder acceso completo cross-tenant al platform staff es
 * el comportamiento pedido, no una sobre-relajación). Un admin de tenant
 * normal (no platform staff) sigue exigiendo `isSameTenantAs()` exacto, sin
 * cambios.
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

    /**
     * Pedido explícito del usuario, 2026-08-11: un Subgestor/Gestor debe
     * poder VER (no gestionar) al usuario de un Generador con el que tiene
     * una relación comercial ACTIVA -- ver `User::
     * hasActiveGeneratorRelationshipWith()`. Deliberadamente SOLO en
     * `view()` -- `update`/`delete`/`activate`/`deactivate`/`resetPassword`/
     * `resendInvitation` de abajo quedan sin cambios (ese usuario sigue sin
     * poder ser gestionado por una organización externa).
     */
    public function view(User $actor, User $target): bool
    {
        return $actor->hasPermission('users.read')
            && ($actor->isSameTenantAs($target)
                || $actor->isPlatformStaff()
                || ($target->tenant_organization_id !== null && $actor->hasActiveGeneratorRelationshipWith($target->tenant_organization_id)));
    }

    public function create(User $actor): bool
    {
        return $actor->hasPermission('users.create');
    }

    public function update(User $actor, User $target): bool
    {
        return $actor->hasPermission('users.update') && ($actor->isSameTenantAs($target) || $actor->isPlatformStaff());
    }

    public function delete(User $actor, User $target): bool
    {
        return $actor->hasPermission('users.delete') && ($actor->isSameTenantAs($target) || $actor->isPlatformStaff());
    }

    public function activate(User $actor, User $target): bool
    {
        return $actor->hasPermission('users.activate') && ($actor->isSameTenantAs($target) || $actor->isPlatformStaff());
    }

    public function deactivate(User $actor, User $target): bool
    {
        return $actor->hasPermission('users.deactivate') && ($actor->isSameTenantAs($target) || $actor->isPlatformStaff());
    }

    public function resetPassword(User $actor, User $target): bool
    {
        return $actor->hasPermission('users.reset-password') && ($actor->isSameTenantAs($target) || $actor->isPlatformStaff());
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
        return $actor->hasPermission('users.create') && ($actor->isSameTenantAs($target) || $actor->isPlatformStaff());
    }
}
