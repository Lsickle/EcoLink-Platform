<?php

namespace App\Policies;

use App\Models\User;
use App\Models\WasteTreatmentApproval;

/**
 * "Evaluación del Gestor". Acceso CRUZADO controlado (distinto del acceso
 * dual platform-staff-vs-tenant del resto del proyecto): AMBOS lados de la
 * relación (el Gestor evaluador y el dueño del residuo) pueden VER la fila
 * -- `WasteTreatmentApproval::isAccessibleBy()` --, pero solo el Gestor
 * evaluador (o platform staff) puede EDITARLA/EVALUARLA --
 * `WasteTreatmentApproval::isEditableBy()`.
 *
 * Decisión de este lote (no confirmada por Catálogo de Permisos.md, mismo
 * GAP ya documentado en otros módulos): se separa `treatment_approvals.update`
 * (edición de términos comerciales/técnicos vía update()) de
 * `treatment_approvals.evaluate` (las 4 transiciones de
 * technical_status/commercial_status) -- mismo criterio granular ya usado
 * en el proyecto para separar `.activate`/`.deactivate` de `.update`, pero
 * aplicado aquí porque "aprobar/rechazar una evaluación" es una acción de
 * mayor impacto de negocio que "editar el precio", y podría necesitar
 * asignarse a un cargo distinto (TECNICO_AMBIENTAL/COMERCIAL, eje 3) sin dar
 * acceso de edición de términos.
 */
class WasteTreatmentApprovalPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('treatment_approvals.read');
    }

    public function view(User $actor, WasteTreatmentApproval $treatmentApproval): bool
    {
        return $actor->hasPermission('treatment_approvals.read') && $treatmentApproval->isAccessibleBy($actor);
    }

    /**
     * Creación real vive en `WasteController`/`Gate::authorize('update',
     * $waste)` (el Generador crea desde SU residuo) -- este método solo
     * cubre el caso de uso "Gestor con permiso propio", si llegara a
     * existir un flujo de creación directo fuera de ese contexto.
     */
    public function create(User $actor): bool
    {
        return $actor->hasPermission('treatment_approvals.create');
    }

    public function update(User $actor, WasteTreatmentApproval $treatmentApproval): bool
    {
        return $actor->hasPermission('treatment_approvals.update') && $treatmentApproval->isEditableBy($actor);
    }

    public function evaluate(User $actor, WasteTreatmentApproval $treatmentApproval): bool
    {
        return $actor->hasPermission('treatment_approvals.evaluate') && $treatmentApproval->isEditableBy($actor);
    }
}
