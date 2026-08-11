<?php

namespace App\Policies;

use App\Models\GeneratorGestorRelationship;
use App\Models\User;

/**
 * Vínculo comercial DIRECTO Generador -> Gestor (Carga Masiva de
 * Generadores). Ver docblock de la migración
 * create_generator_gestor_relationships_table. Acceso DUAL NO simétrico
 * (mismo criterio que `GeneratorSubgestorRelationshipPolicy`): AMBOS lados
 * (Generador Y Gestor) pueden VER el registro, pero SOLO el Gestor dueño de
 * `gestor_organization_id` puede crear/revocar -- el Generador NUNCA puede
 * auto-asignarse un Gestor (anti-IDOR explícito, ver
 * `GeneratorGestorRelationshipController::store()`).
 */
class GeneratorGestorRelationshipPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('generator_gestor_relationships.read');
    }

    public function view(User $actor, GeneratorGestorRelationship $relationship): bool
    {
        return $actor->hasPermission('generator_gestor_relationships.read') && $relationship->isAccessibleBy($actor);
    }

    /**
     * `$gestorOrganizationId` es la organización Gestor que registra al
     * Generador cliente -- mismo criterio anti-role-smuggling que
     * `GeneratorSubgestorRelationshipPolicy::create()`: un tenant admin
     * SIEMPRE registra desde SU PROPIA organización, solo platform staff
     * puede indicar una organización Gestor arbitraria.
     */
    public function create(User $actor, ?int $gestorOrganizationId = null): bool
    {
        if (! $actor->hasPermission('generator_gestor_relationships.create')) {
            return false;
        }

        if ($actor->isPlatformStaff()) {
            return true;
        }

        $gestorOrganizationId ??= $actor->tenant_organization_id;

        return $gestorOrganizationId === $actor->tenant_organization_id;
    }

    /**
     * Solo el Gestor DUEÑO de `gestor_organization_id` puede revocar -- el
     * Generador, aunque tenga acceso de LECTURA (ver `isAccessibleBy()`), no
     * puede revocar la relación por su cuenta.
     */
    public function revoke(User $actor, GeneratorGestorRelationship $relationship): bool
    {
        return $actor->hasPermission('generator_gestor_relationships.revoke')
            && ($actor->isPlatformStaff() || $relationship->gestor_organization_id === $actor->tenant_organization_id);
    }
}
