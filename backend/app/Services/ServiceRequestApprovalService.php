<?php

namespace App\Services;

use App\Models\ServiceItemStatus;
use App\Models\ServiceStatus;
use App\Models\User;
use App\Models\WasteServiceRequest;
use App\Models\WasteServiceRequestItem;
use App\Models\Workflow;
use App\Models\WorkflowLog;
use App\Models\WorkflowTransition;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Fase 1b del Módulo Solicitudes de Servicio -- aprobación/rechazo POR ÍTEM
 * (D-S25: cada Gestor evalúa SOLO los ítems de su propio
 * `waste_treatment_approval`) + recálculo del AGREGADO de cabecera (D-S01:
 * la cabecera pasa a `APPROVED` únicamente cuando TODOS los ítems de la
 * solicitud tienen `item_status=ACCEPTED`; si CUALQUIER ítem queda
 * `REJECTED`, la cabecera pasa a `REJECTED` de inmediato).
 *
 * D-S27 (confirmado, no se reinterpreta): esta lógica de agregado vive en
 * ESTA capa de servicio, NO en el motor de Workflow genérico -- el motor
 * (`workflows`/`workflow_transitions`/`workflow_transition_roles`) solo sabe
 * "quién puede mover esta entidad de un código a otro", no tiene ningún
 * concepto de "todos los hijos de esta cabecera deben estar en tal estado".
 * Esta clase SÍ reutiliza el motor para la mecánica de la transición de
 * CABECERA en sí (`transitionHeader()`, vía `Workflow::resolveFor('SERVICE', ...)`),
 * pero decide CUÁNDO dispararla evaluando los ítems -- eso es lo que D-S27
 * reserva para la capa de aplicación.
 *
 * Métodos ESTÁTICOS -- mismo criterio ya establecido en este proyecto para
 * clases de `App\Services` sin estado de instancia (ver
 * {@see \App\Services\UserProvisioningService}).
 */
class ServiceRequestApprovalService
{
    /**
     * D-S25: SOLO el Gestor dueño del `waste_treatment_approval` de ESTE
     * ítem (nunca otro Gestor de la misma solicitud) puede aprobarlo. La
     * autorización "real" ya la exige `ServiceRequestPolicy::evaluateItem()`
     * (Gate) antes de llegar aquí -- `assertActorOwnsItemGestor()` se repite
     * como defensa en profundidad, mismo criterio que
     * `WasteTreatmentApprovalController::assertBranchTreatmentOrganizationCanTreatWaste()`:
     * este método nunca debe ser invocable de forma insegura, aunque un
     * futuro consumidor olvide pasar por la Policy.
     */
    public static function approveItem(WasteServiceRequestItem $item, User $actor, ?string $notes = null): WasteServiceRequestItem
    {
        self::assertActorOwnsItemGestor($item, $actor);

        return self::transitionItem($item, $actor, 'ACCEPTED', $notes);
    }

    /**
     * Mismo criterio que {@see self::approveItem()}, resultado `REJECTED`.
     */
    public static function rejectItem(WasteServiceRequestItem $item, User $actor, ?string $notes = null): WasteServiceRequestItem
    {
        self::assertActorOwnsItemGestor($item, $actor);

        return self::transitionItem($item, $actor, 'REJECTED', $notes);
    }

    private static function transitionItem(WasteServiceRequestItem $item, User $actor, string $itemStatusCode, ?string $notes): WasteServiceRequestItem
    {
        return DB::transaction(function () use ($item, $actor, $itemStatusCode, $notes) {
            $statusId = ServiceItemStatus::query()->where('code', $itemStatusCode)->value('id');

            if ($statusId === null) {
                throw new \LogicException("Catálogo service_item_statuses sin el valor '{$itemStatusCode}' sembrado.");
            }

            $item->forceFill([
                'item_status_id' => $statusId,
                'observations' => $notes ?? $item->observations,
            ])->save();

            $serviceRequest = $item->serviceRequest()->firstOrFail();
            self::recalculateHeaderStatus($serviceRequest, $actor);

            return $item->fresh();
        });
    }

    /**
     * D-S01 (regla de agregado): consulta TODOS los ítems de la solicitud.
     * - Si CUALQUIER ítem está `REJECTED` -> cabecera `REJECTED` de inmediato
     *   (no espera a que el resto de Gestores evalúen).
     * - Si TODOS los ítems están `ACCEPTED` -> cabecera `APPROVED`.
     * - En cualquier otro caso (mezcla de `PENDING`/`ACCEPTED` sin ningún
     *   `REJECTED` todavía) -> la cabecera NO se mueve, permanece en
     *   `UNDER_REVIEW`.
     */
    public static function recalculateHeaderStatus(WasteServiceRequest $serviceRequest, User $actor): void
    {
        $items = $serviceRequest->items()->with('itemStatus')->get();

        if ($items->isEmpty()) {
            return;
        }

        $hasRejected = $items->contains(fn (WasteServiceRequestItem $item) => $item->itemStatus?->code === 'REJECTED');
        $allAccepted = $items->every(fn (WasteServiceRequestItem $item) => $item->itemStatus?->code === 'ACCEPTED');

        if ($hasRejected) {
            self::transitionHeader($serviceRequest, $actor, 'REJECTED');
        } elseif ($allAccepted) {
            self::transitionHeader($serviceRequest, $actor, 'APPROVED');
        }
    }

    /**
     * Aplica una transición de CABECERA (`waste_service_requests.service_status_id`)
     * vía el motor de Workflow genérico -- `Workflow::resolveFor('SERVICE',
     * $serviceRequest->organization_id)` se resuelve contra el GENERADOR
     * dueño de la solicitud (mismo eje "dueño natural de la entidad que
     * transiciona" que usa `WasteTreatmentApprovalController` contra el
     * Gestor evaluador de `waste_treatment_approvals`).
     *
     * Idempotente: si el estado actual YA es `$toCode`, no hace nada. Si no
     * existe una `workflow_transition` real desde el código actual hacia
     * `$toCode` (o el actor no tiene el rol que la autoriza), 422/403
     * legible -- mismo criterio que
     * `WasteTreatmentApprovalController::resolveWorkflowTransition()`/
     * `assertActorAuthorizedForTransition()`.
     *
     * Público y reutilizado por `ServiceRequestController::submit()`/`cancel()`
     * para las transiciones DRAFT->SUBMITTED, SUBMITTED->UNDER_REVIEW
     * (automática) y cualquier-estado-no-final->CANCELLED -- evita duplicar
     * la resolución del motor de Workflow en el controller.
     */
    public static function transitionHeader(WasteServiceRequest $serviceRequest, User $actor, string $toCode): WasteServiceRequest
    {
        $serviceRequest->loadMissing('serviceStatus');
        $fromCode = $serviceRequest->serviceStatus?->code;

        if ($fromCode === $toCode) {
            return $serviceRequest;
        }

        $workflow = Workflow::resolveFor('SERVICE', $serviceRequest->organization_id);

        $transition = $workflow?->currentVersion
            ?->transitions()
            ->where('from_status_code', $fromCode)
            ->where('to_status_code', $toCode)
            ->with(['roles.role', 'roles.businessRole'])
            ->first();

        if ($transition === null) {
            throw ValidationException::withMessages([
                'service_status' => ["No existe una transición configurada de {$fromCode} a {$toCode} para esta solicitud."],
            ]);
        }

        self::assertActorAuthorizedForTransition($actor, $transition);

        $statusId = self::resolveServiceStatusId($serviceRequest->organization_id, $toCode);

        $serviceRequest->forceFill(['service_status_id' => $statusId, 'updated_by' => $actor->id])->save();

        self::logWorkflowTransition($serviceRequest, $actor, $fromCode, $toCode);

        return $serviceRequest->fresh();
    }

    /**
     * Hallazgo Alta (especialista-seguridad, revisión de
     * `ServiceRequestController`/`ServiceRequestApprovalService`, 2026-07-19):
     * ninguna transición de CABECERA quedaba registrada en `workflow_logs` --
     * a diferencia del patrón ya establecido y corregido por seguridad en
     * `WasteTreatmentApprovalController::logWorkflowTransition()`. Se replica
     * ese mismo patrón aquí, para las 3 vías que mueven
     * `waste_service_requests.service_status_id`: `submit()` (DRAFT->SUBMITTED
     * y la automática SUBMITTED->UNDER_REVIEW, ambas vía `transitionHeader()`),
     * `cancel()` (->CANCELLED), y el recálculo automático de cabecera
     * disparado por `recalculateHeaderStatus()` tras aprobar/rechazar un ítem
     * (->APPROVED/->REJECTED). Como las 3 vías comparten `transitionHeader()`
     * como único punto de escritura de la columna, basta instrumentar AQUÍ --
     * ningún controller necesita loguear por su cuenta.
     *
     * `tenant_organization_id` = organización DUEÑA de la solicitud
     * (`$serviceRequest->organization_id`, el Generador), NUNCA el tenant del
     * actor -- mismo criterio que el fix de seguridad ya aplicado en
     * `WasteTreatmentApprovalController::logWorkflowTransition()` (evita que,
     * cuando actúa platform staff, el log quede atribuido al tenant
     * PLATAFORMA en vez de al Generador real dueño del proceso).
     */
    private static function logWorkflowTransition(WasteServiceRequest $serviceRequest, User $actor, ?string $fromCode, string $toCode): void
    {
        WorkflowLog::query()->create([
            'traceability_uuid' => (string) Str::uuid(),
            'tenant_organization_id' => $serviceRequest->organization_id,
            'user_id' => $actor->id,
            'process_type' => 'SERVICE_REQUEST',
            'process_id' => $serviceRequest->id,
            'event_code' => "SERVICE_REQUEST_{$toCode}",
            'event_name' => "Solicitud de servicio transicionada a {$toCode}",
            'description' => "Transición {$fromCode} -> {$toCode} de la solicitud de servicio '{$serviceRequest->request_code}'.",
            'previous_status' => $fromCode,
            'new_status' => $toCode,
            'severity' => 'INFO',
            'source' => 'api',
        ]);
    }

    /**
     * D-S02: prefiere un `service_statuses` PERSONALIZADO de la propia
     * organización (si existe), cae al catálogo GLOBAL (`organization_id`
     * NULL) en caso contrario -- mismo patrón D-R05 ya usado en el resto del
     * esquema para catálogos con personalización opcional por organización.
     */
    private static function resolveServiceStatusId(int $organizationId, string $code): int
    {
        $id = ServiceStatus::query()->where('organization_id', $organizationId)->where('code', $code)->value('id');
        $id ??= ServiceStatus::query()->whereNull('organization_id')->where('code', $code)->value('id');

        if ($id === null) {
            throw new \LogicException("Catálogo service_statuses sin el valor '{$code}' sembrado.");
        }

        return $id;
    }

    /**
     * Mismo criterio exacto que
     * `WasteTreatmentApprovalController::assertActorAuthorizedForTransition()`:
     * platform staff siempre pasa; si la transición no tiene ninguna fila de
     * `workflow_transition_roles` configurada (ej. la automática
     * SUBMITTED->UNDER_REVIEW), no hay restricción adicional.
     */
    private static function assertActorAuthorizedForTransition(User $actor, WorkflowTransition $transition): void
    {
        if ($actor->isPlatformStaff()) {
            return;
        }

        $transitionRoles = $transition->roles;

        if ($transitionRoles->isEmpty()) {
            return;
        }

        foreach ($transitionRoles as $transitionRole) {
            if ($transitionRole->role_id !== null && $transitionRole->role !== null && $actor->hasRole($transitionRole->role->code)) {
                return;
            }

            if ($transitionRole->business_role_id !== null
                && $actor->tenantOrganization?->businessRoles()
                    ->where('business_roles.id', $transitionRole->business_role_id)
                    ->wherePivot('is_active', true)
                    ->exists()) {
                return;
            }
        }

        abort(403, 'El actor no tiene el rol requerido por el workflow configurado para esta transición.');
    }

    /**
     * D-S25: SOLO el Gestor dueño de `waste_treatment_approval_id` de ESTE
     * ítem (o platform staff) puede evaluarlo -- nunca otro Gestor de la
     * misma solicitud. Un ítem sin `waste_treatment_approval_id` asignado
     * (todavía en Borrador) no tiene Gestor dueño -- nadie puede evaluarlo.
     */
    private static function assertActorOwnsItemGestor(WasteServiceRequestItem $item, User $actor): void
    {
        if ($actor->isPlatformStaff()) {
            return;
        }

        $gestorOrganizationId = $item->wasteTreatmentApproval?->organization_id;

        if ($gestorOrganizationId === null || $gestorOrganizationId !== $actor->tenant_organization_id) {
            abort(403, 'No tiene acceso para evaluar este ítem.');
        }
    }
}
