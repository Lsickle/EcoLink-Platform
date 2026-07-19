<?php

namespace App\Policies;

use App\Models\User;
use App\Models\Workflow;

/**
 * CU-021 "Configurar Workflow" -- gateado por el permiso dedicado
 * `workflows.manage` (hallazgo especialista-seguridad, requisito 2) más el
 * mismo par `isAccessibleBy()`/`isEditableBy()` ya usado en
 * `OrganizationalAreaPolicy`/`WasteTreatmentApprovalPolicy`:
 *
 * - `viewAny`/`view`: cualquier actor con el permiso ve el workflow BASE
 *   (`tenant_organization_id IS NULL`, solo lectura) y, si es de una
 *   organización, también el SUYO propio (si existe) -- ver `isAccessibleBy()`.
 * - `clone`: SOLO un admin de organización Gestor (`can_treat_waste=true`,
 *   NUNCA platform staff -- platform staff no "clona para sí", administra el
 *   base directamente) sobre el workflow BASE.
 * - `update` (editar transiciones/versionar/publicar): SOLO platform staff
 *   sobre el BASE, o el dueño sobre SU PROPIO workflow -- ver
 *   `isEditableBy()`. Nunca el workflow ajeno ni el base para un no-staff.
 */
class WorkflowPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('workflows.manage');
    }

    public function view(User $actor, Workflow $workflow): bool
    {
        return $actor->hasPermission('workflows.manage') && $workflow->isAccessibleBy($actor);
    }

    /**
     * Solo sobre el workflow BASE (`tenant_organization_id IS NULL`) y solo
     * para un admin de organización Gestor -- platform staff se excluye
     * deliberadamente: "clonar" es la acción de un Gestor personalizando SU
     * propio workflow, no algo que EcoLink haga en su nombre.
     */
    public function clone(User $actor, Workflow $workflow): bool
    {
        return $actor->hasPermission('workflows.manage')
            && ! $actor->isPlatformStaff()
            && $workflow->tenant_organization_id === null
            && $actor->tenantOrganization?->hasCapability('can_treat_waste') === true;
    }

    public function update(User $actor, Workflow $workflow): bool
    {
        return $actor->hasPermission('workflows.manage') && $workflow->isEditableBy($actor);
    }
}
