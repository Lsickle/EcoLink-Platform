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
 *
 * Corrección del modelo de negocio confirmada por el usuario, 2026-08-12: un
 * Gestor con relación `generator_gestor_relationships` ACTIVA gana la MISMA
 * excepción de `view()` que ya tenía el Subgestor (`Waste::
 * isForwardableByGestor()`) -- la declaración de un residuo debe ser visible
 * de inmediato para cualquier Gestor/Subgestor vinculado, sin que nadie
 * tenga que "solicitar evaluación" primero. Igual que con el Subgestor,
 * `update()`/`submit()`/etc. NO se tocan -- el Gestor puede ver y ofrecer su
 * propio tratamiento (`requestEvaluation()`), nunca editar/clasificar el
 * residuo ajeno.
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
            && ($waste->isAccessibleBy($actor) || $waste->isForwardableBySubgestor($actor) || $waste->isForwardableByGestor($actor));
    }

    public function create(User $actor): bool
    {
        return $actor->hasPermission('wastes.create');
    }

    /**
     * Blindaje posterior a la aprobacion (Fase 3, 2026-08-15). Un residuo
     * APROBADO o SUSPENDIDO ya arrastra solicitudes, programaciones y
     * certificados: editarlo dejaria esos documentos describiendo algo
     * distinto de lo que se movio. El camino previsto es crear un residuo
     * NUEVO; las correcciones puntuales pasan por soporte y las ejecuta
     * EcoLink.
     *
     * ALCANCE: esta puerta la comparten `update()`, `activate()`,
     * `deactivate()`, los tres `sync*()` de clasificacion y
     * `usePreapprovedMatch()` -- todos usan `Gate::authorize('update')`. Es
     * deliberado: desactivar un residuo aprobado es "retirarlo de
     * circulacion" por otro nombre, y eso quedo reservado a EcoLink via
     * suspension (decision del usuario, 2026-08-14).
     */
    public function update(User $actor, Waste $waste): bool
    {
        if (! $actor->hasPermission('wastes.update') || ! $waste->isAccessibleBy($actor)) {
            return false;
        }

        if (in_array($waste->status, [Waste::STATUS_APPROVED, Waste::STATUS_SUSPENDED], true)) {
            return $actor->isPlatformStaff();
        }

        return true;
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
     *
     * Corrección del modelo de negocio, 2026-08-12: se agrega
     * `isForwardableByGestor()` como TERCER camino -- un Gestor con relación
     * activa puede ofrecer su propio tratamiento sin ser el dueño ni un
     * Subgestor reenviando. `storeForWaste()` distingue estos 3 casos para
     * fijar `forwarded_by_organization_id` correctamente (NULL para el
     * Gestor que ofrece directo -- no es un reenvío de un tercero) y para
     * exigir que el `branch_treatment_id` elegido sea de su PROPIA
     * organización.
     */
    public function requestEvaluation(User $actor, Waste $waste): bool
    {
        if (! $actor->hasPermission('treatment_approvals.create')) {
            return false;
        }

        if ($waste->isAccessibleBy($actor)) {
            return $actor->hasPermission('wastes.update');
        }

        return $waste->isForwardableBySubgestor($actor) || $waste->isForwardableByGestor($actor);
    }
}
