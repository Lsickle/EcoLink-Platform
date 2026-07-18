<?php

namespace App\Policies;

use App\Models\User;
use App\Models\Waste;

/**
 * "Residuos Preaprobados" (`wastes.waste_type_id` = catálogo `PREAPPROVED`):
 * residuos de referencia propiedad de una organización Gestor, con una
 * `WasteTreatmentApproval` auto-aprobada (ambos ejes) desde su creación --
 * ver `PreapprovedWasteController`. Mismo criterio de aislamiento que
 * `OrganizationalAreaPolicy`/`WastePolicy`: platform staff ve/gestiona la
 * lista de TODAS las organizaciones Gestor (cross-tenant, por diseño); un
 * admin de tenant solo ve/gestiona la lista de SU PROPIA organización -- vía
 * `Waste::isAccessibleBy()`.
 *
 * NO se registra como la Policy auto-descubierta de `Waste` (Laravel
 * resuelve por convención `App\Policies\{Model}Policy` -- esa ranura ya la
 * ocupa `WastePolicy`, para el CRUD/workflow normal de declaración de
 * residuos). Por eso esta clase NO se invoca vía
 * `Gate::authorize($ability, Waste::class)` -- eso resolvería siempre
 * `WastePolicy`, ignorando esta clase por completo -- sino EXPLÍCITAMENTE
 * desde `PreapprovedWasteController` (`app(PreapprovedWastePolicy::class)`),
 * igual que cualquier otro servicio inyectado a mano. Los permisos
 * (`preapproved_wastes.read`/`.manage`) son un catálogo aparte de
 * `wastes.*` a propósito: conceptualmente es una pantalla y un flujo
 * distintos (catálogo de referencia auto-aprobado del Gestor, no
 * declaración/clasificación de un residuo real de un Generador).
 *
 * `create` no depende de una instancia -- el controller valida server-side
 * que la organización DESTINO tenga la capacidad `can_treat_waste`
 * (`Organization::hasCapability()`), mismo patrón ya usado por
 * `OrganizationalAreaController::store()`/`BranchTreatmentController::store()`
 * para reglas que dependen de la organización de destino, no de un registro
 * ya creado.
 */
class PreapprovedWastePolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('preapproved_wastes.read');
    }

    public function view(User $actor, Waste $waste): bool
    {
        return $actor->hasPermission('preapproved_wastes.read') && $waste->isAccessibleBy($actor);
    }

    public function create(User $actor): bool
    {
        return $actor->hasPermission('preapproved_wastes.manage');
    }

    public function update(User $actor, Waste $waste): bool
    {
        return $actor->hasPermission('preapproved_wastes.manage') && $waste->isAccessibleBy($actor);
    }
}
