<?php

namespace App\Policies;

use App\Models\SubgestorGestorRelationship;
use App\Models\User;

/**
 * Vínculo comercial Subgestor -> Gestor (Fase 2 del ciclo de vida del residuo).
 * Ver docblock de la migración create_subgestor_gestor_relationships_table.
 *
 * Acceso DUAL NO simétrico, mismo criterio que las otras dos relaciones
 * comerciales: ambos lados pueden VER el registro, pero solo el SUBGESTOR dueño
 * de `subgestor_organization_id` puede crear/revocar.
 *
 * Aquí el lado que gestiona es el Subgestor -- al revés que en
 * `GeneratorGestorRelationshipPolicy`, donde gestiona el Gestor. La razón: un
 * Gestor DE REFERENCIA no tiene usuarios en la plataforma, así que no podría
 * autorizar nada. (Recomendación propia, 2026-08-15: el usuario no se pronunció
 * sobre este punto.)
 */
class SubgestorGestorRelationshipPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('subgestor_gestor_relationships.read');
    }

    public function view(User $actor, SubgestorGestorRelationship $relationship): bool
    {
        return $actor->hasPermission('subgestor_gestor_relationships.read') && $relationship->isAccessibleBy($actor);
    }

    /**
     * Mismo criterio anti-role-smuggling que las otras dos: un tenant admin
     * SIEMPRE registra desde SU PROPIA organización; solo platform staff puede
     * indicar una organización Subgestora arbitraria.
     */
    public function create(User $actor, ?int $subgestorOrganizationId = null): bool
    {
        if (! $actor->hasPermission('subgestor_gestor_relationships.create')) {
            return false;
        }

        if ($actor->isPlatformStaff()) {
            return true;
        }

        $subgestorOrganizationId ??= $actor->tenant_organization_id;

        return $subgestorOrganizationId === $actor->tenant_organization_id;
    }

    public function revoke(User $actor, SubgestorGestorRelationship $relationship): bool
    {
        return $actor->hasPermission('subgestor_gestor_relationships.revoke')
            && ($actor->isPlatformStaff() || $relationship->subgestor_organization_id === $actor->tenant_organization_id);
    }
}
