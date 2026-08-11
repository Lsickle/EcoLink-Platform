<?php

namespace App\Policies;

use App\Models\GeneratorSubgestorRelationship;
use App\Models\User;

/**
 * Cadena Generador -> Subgestor -> Gestor en Declaración de Residuos. Ver
 * docblock de la migración create_generator_subgestor_relationships_table.
 * Acceso DUAL NO simétrico (mismo criterio que
 * `GestorCarrierAuthorizationPolicy`): AMBOS lados (Generador Y Subgestor)
 * pueden VER el registro, pero SOLO el Subgestor dueño de
 * `subgestor_organization_id` puede crear/revocar -- el Generador NUNCA
 * puede auto-asignarse un Subgestor (anti-IDOR explícito, ver
 * `GeneratorSubgestorRelationshipController::store()`).
 */
class GeneratorSubgestorRelationshipPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('generator_subgestor_relationships.read');
    }

    public function view(User $actor, GeneratorSubgestorRelationship $relationship): bool
    {
        return $actor->hasPermission('generator_subgestor_relationships.read') && $relationship->isAccessibleBy($actor);
    }

    /**
     * `$subgestorOrganizationId` es la organización Subgestor que registra
     * al Generador cliente -- mismo criterio anti-role-smuggling que
     * `GestorCarrierAuthorizationPolicy::create()`: un tenant admin SIEMPRE
     * registra desde SU PROPIA organización, solo platform staff puede
     * indicar una organización Subgestor arbitraria.
     */
    public function create(User $actor, ?int $subgestorOrganizationId = null): bool
    {
        if (! $actor->hasPermission('generator_subgestor_relationships.create')) {
            return false;
        }

        if ($actor->isPlatformStaff()) {
            return true;
        }

        $subgestorOrganizationId ??= $actor->tenant_organization_id;

        return $subgestorOrganizationId === $actor->tenant_organization_id;
    }

    /**
     * Solo el Subgestor DUEÑO de `subgestor_organization_id` puede revocar
     * -- el Generador, aunque tenga acceso de LECTURA (ver
     * `isAccessibleBy()`), no puede revocar la relación por su cuenta.
     */
    public function revoke(User $actor, GeneratorSubgestorRelationship $relationship): bool
    {
        return $actor->hasPermission('generator_subgestor_relationships.revoke')
            && ($actor->isPlatformStaff() || $relationship->subgestor_organization_id === $actor->tenant_organization_id);
    }
}
