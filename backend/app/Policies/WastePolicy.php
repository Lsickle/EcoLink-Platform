<?php

namespace App\Policies;

use App\Models\User;
use App\Models\Waste;

/**
 * Núcleo del Módulo Residuos (declaración + clasificación). Acceso DUAL,
 * mismo patrón exacto que `VehiclePolicy`/`BranchTreatmentPolicy`: platform
 * staff gestiona TODOS los residuos; un admin de tenant (o usuario con
 * `wastes.read`) solo los de su propia organización -- ver
 * `Waste::isAccessibleBy()`. SIN restricción de business_role (confirmado
 * por el usuario: "cualquier rol de negocio puede registrar residuos").
 *
 * Las transiciones de workflow (submit/startReview/classify/reject) tienen
 * su PROPIO método de Policy, cada uno gateado por su permiso dedicado
 * (`wastes.submit`/`.review`/`.classify`/`.reject`) + accesibilidad -- NO
 * requieren además `wastes.update`, a diferencia de `activate()`/
 * `deactivate()` (que sí siguen el patrón doble-permiso ya establecido en
 * `VehiclePolicy`/`BranchTreatmentPolicy` vía el método `update()`).
 *
 * Cadena Generador -> Subgestor -> Gestor (confirmado por stakeholders
 * reales, 2026-08-09): `view()` se extiende con
 * `Waste::isForwardableBySubgestor()` -- un Subgestor con relación activa
 * puede VER el residuo de su Generador cliente para decidir si reenviarlo,
 * pero `update()`/`submit()`/`startReview()`/`classify()`/`reject()` NO se
 * tocan (siguen exigiendo `isAccessibleBy()` a secas) -- el Subgestor nunca
 * edita/clasifica/rechaza el residuo de un Generador ajeno. Ver
 * `requestEvaluation()` abajo para la ability de reenvío en sí.
 */
class WastePolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('wastes.read');
    }

    public function view(User $actor, Waste $waste): bool
    {
        return $actor->hasPermission('wastes.read')
            && ($waste->isAccessibleBy($actor) || $waste->isForwardableBySubgestor($actor));
    }

    public function create(User $actor): bool
    {
        return $actor->hasPermission('wastes.create');
    }

    public function update(User $actor, Waste $waste): bool
    {
        return $actor->hasPermission('wastes.update') && $waste->isAccessibleBy($actor);
    }

    public function submit(User $actor, Waste $waste): bool
    {
        return $actor->hasPermission('wastes.submit') && $waste->isAccessibleBy($actor);
    }

    public function startReview(User $actor, Waste $waste): bool
    {
        return $actor->hasPermission('wastes.review') && $waste->isAccessibleBy($actor);
    }

    public function classify(User $actor, Waste $waste): bool
    {
        return $actor->hasPermission('wastes.classify') && $waste->isAccessibleBy($actor);
    }

    public function reject(User $actor, Waste $waste): bool
    {
        return $actor->hasPermission('wastes.reject') && $waste->isAccessibleBy($actor);
    }

    /**
     * Ability DISTINTA de `update()` a propósito (cadena Generador ->
     * Subgestor -> Gestor, 2026-08-09), pero que PRESERVA el requisito
     * original para el lado dueño/directo (`wastes.update` +
     * `treatment_approvals.create`, ya cubierto por test explícito) -- solo
     * se relaja para el Subgestor que reenvía en nombre de otro, que nunca
     * tiene (ni necesita) `wastes.update` sobre el residuo ajeno.
     * Consumida por `WasteTreatmentApprovalController::storeForWaste()`.
     */
    public function requestEvaluation(User $actor, Waste $waste): bool
    {
        if (! $actor->hasPermission('treatment_approvals.create')) {
            return false;
        }

        if ($waste->isAccessibleBy($actor)) {
            return $actor->hasPermission('wastes.update');
        }

        return $waste->isForwardableBySubgestor($actor);
    }
}
